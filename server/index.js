/*
Copyright 2022 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

/**
 * MCP Apps Server for Adobe I/O Runtime
 *
 * Entry point for the MCP server deployed as an Adobe I/O Runtime action.
 * Uses the stateless pattern: fresh server and transport instances per request.
 *
 * Actions (tools + optional widgets) are auto-discovered from the actions/ directory.
 */

const { Core } = require('@adobe/aio-sdk')
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp')
const { WebStandardStreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/webStandardStreamableHttp')
const { loadActions } = require('./loader.js')
const crypto = require('crypto')
const path = require('path')

// Make crypto.randomUUID available globally for Web Standard APIs
if (!global.crypto) {
    global.crypto = crypto
}

let logger = null

/**
 * Create MCP server instance with all actions registered.
 */
function createMcpServer () {
    const server = new McpServer({
        name: 'llm-apps-poc',
        version: '1.0.0'
    }, {
        capabilities: {
            logging: {},
            tools: {},
            resources: {}
        }
    })

    const baseDir = __dirname
    loadActions(server, path.join(baseDir, '..', 'actions'))

    if (logger) {
        logger.info('MCP Server created with actions registered')
    }

    return server
}

/**
 * Parse request body from Adobe I/O Runtime parameters.
 */
function parseRequestBody (params) {
    if (!params.__ow_body) {
        return null
    }

    try {
        if (typeof params.__ow_body === 'string') {
            try {
                const decoded = Buffer.from(params.__ow_body, 'base64').toString('utf8')
                return JSON.parse(decoded)
            } catch (e) {
                return JSON.parse(params.__ow_body)
            }
        } else {
            return params.__ow_body
        }
    } catch (error) {
        logger?.error('Failed to parse request body:', error)
        throw new Error(`Failed to parse request body: ${error.message}`)
    }
}

/**
 * Handle health check requests.
 */
function handleHealthCheck () {
    return {
        statusCode: 200,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, DELETE',
            'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization, x-api-key, mcp-session-id, Last-Event-ID',
            'Access-Control-Expose-Headers': 'Content-Type, mcp-session-id, Last-Event-ID',
            'Access-Control-Max-Age': '86400',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            status: 'healthy',
            server: 'llm-apps-poc',
            version: '1.0.0',
            description: 'Adobe I/O Runtime MCP Apps Server',
            timestamp: new Date().toISOString(),
            transport: 'StreamableHTTP',
            sdk: '@modelcontextprotocol/sdk'
        })
    }
}

/**
 * Handle CORS OPTIONS requests.
 */
function handleOptionsRequest () {
    return {
        statusCode: 200,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, DELETE',
            'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization, x-api-key, mcp-session-id, Last-Event-ID',
            'Access-Control-Expose-Headers': 'Content-Type, mcp-session-id, Last-Event-ID',
            'Access-Control-Max-Age': '86400'
        },
        body: ''
    }
}

/**
 * Handle MCP requests using the SDK.
 * Creates fresh server and transport instances per request (stateless pattern).
 */
async function handleMcpRequest (params) {
    const server = createMcpServer()

    try {
        logger?.info('Creating fresh MCP server and transport')

        const body = parseRequestBody(params)
        logger?.info('Request method:', body?.method)

        const url = `https://${params.__ow_headers?.host || 'localhost'}/mcp-server`
        const request = new Request(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...params.__ow_headers
            },
            body: JSON.stringify(body)
        })

        const transport = new WebStandardStreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
            enableJsonResponse: true
        })

        await server.connect(transport)

        const response = await transport.handleRequest(request)

        const responseBody = await response.text()
        const responseHeaders = {}
        response.headers.forEach((value, key) => {
            responseHeaders[key] = value
        })

        logger?.info('MCP request processed by SDK')

        return {
            statusCode: response.status,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, DELETE',
                'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization, x-api-key, mcp-session-id, Last-Event-ID',
                'Access-Control-Expose-Headers': 'Content-Type, mcp-session-id, Last-Event-ID',
                ...responseHeaders
            },
            body: responseBody
        }
    } catch (error) {
        logger?.error('Error in handleMcpRequest:', error)

        try {
            server.close()
        } catch (cleanupError) {
            logger?.error('Error during cleanup:', cleanupError)
        }

        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                error: {
                    code: -32603,
                    message: `Internal server error: ${error.message}`
                },
                id: null
            })
        }
    }
}

/**
 * Main function for Adobe I/O Runtime.
 */
async function main (params) {
    try {
        console.log('=== MCP APPS SERVER ===')
        console.log('Method:', params.__ow_method)

        try {
            logger = Core.Logger('llm-apps-poc', { level: params.LOG_LEVEL || 'info' })
        } catch (loggerError) {
            console.error('Logger creation error:', loggerError)
            return {
                statusCode: 500,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: `Logger creation error: ${loggerError.message}` })
            }
        }

        logger.info('MCP Apps Server started')
        logger.info(`Request method: ${params.__ow_method}`)

        const incomingHeaders = {}
        if (params.__ow_headers) {
            for (const key in params.__ow_headers) {
                incomingHeaders[key.toLowerCase()] = params.__ow_headers[key]
            }
        }

        switch (params.__ow_method?.toLowerCase()) {
        case 'get':
            if (incomingHeaders.accept && incomingHeaders.accept.includes('text/event-stream')) {
                logger.info('SSE stream requested - not supported in serverless, returning graceful response')
                return {
                    statusCode: 200,
                    headers: {
                        'Access-Control-Allow-Origin': '*',
                        'Content-Type': 'text/event-stream',
                        'Cache-Control': 'no-cache',
                        Connection: 'close'
                    },
                    body: 'event: error\ndata: {"error": "SSE not supported in serverless. Use HTTP transport."}\n\n'
                }
            }
            logger.info('Health check request')
            return handleHealthCheck()

        case 'options':
            logger.info('CORS preflight request')
            return handleOptionsRequest()

        case 'post':
            logger.info('MCP protocol request - delegating to SDK')
            return await handleMcpRequest(params)

        default:
            logger.warn(`Method not allowed: ${params.__ow_method}`)
            return {
                statusCode: 405,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    error: {
                        code: -32000,
                        message: `Method '${params.__ow_method}' not allowed. Supported: GET, POST, OPTIONS`
                    },
                    id: null
                })
            }
        }
    } catch (error) {
        if (logger) {
            logger.error('Uncaught error in main function:', error)
        } else {
            console.error('Uncaught error in main function:', error)
        }

        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                error: {
                    code: -32603,
                    message: `Unhandled server error: ${error.message}`
                },
                id: null
            })
        }
    }
}

module.exports = { main }
