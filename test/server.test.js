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
 * Test suite for MCP Apps Server
 *
 * Tests action discovery, tool registration, widget resource serving,
 * and MCP protocol compliance across two modes:
 *   - Mode A: With actions.json (full metadata from config)
 *   - Mode B: Without actions.json (handler-only defaults)
 */

const fs = require('fs')
const path = require('path')
const { main } = require('../server/index.js')

const ACTIONS_JSON_PATH = path.resolve(__dirname, '..', 'actions.json')
const FIXTURES_ACTIONS = path.resolve(__dirname, 'fixtures', 'actions.json')

function mcpPost (body) {
    return main({
        __ow_method: 'post',
        __ow_body: JSON.stringify(body),
        __ow_headers: {
            'content-type': 'application/json',
            accept: 'application/json;q=1.0, text/event-stream;q=0.5'
        },
        LOG_LEVEL: 'info'
    })
}

function installActionsJson () {
    fs.copyFileSync(FIXTURES_ACTIONS, ACTIONS_JSON_PATH)
}

function removeActionsJson () {
    try { fs.unlinkSync(ACTIONS_JSON_PATH) } catch (e) { /* ignore */ }
}

describe('MCP Apps Server', () => {
    // --- Health Check ---

    describe('Health Check', () => {
        test('should respond to GET with health status', async () => {
            const result = await main({
                __ow_method: 'get',
                __ow_path: '/',
                LOG_LEVEL: 'info'
            })

            expect(result.statusCode).toBe(200)
            expect(result.headers['Content-Type']).toBe('application/json')

            const body = JSON.parse(result.body)
            expect(body.status).toBe('healthy')
            expect(body.server).toBe('llm-apps-poc')
            expect(body.version).toBe('1.0.0')
        })
    })

    // --- CORS ---

    describe('CORS Support', () => {
        test('should handle OPTIONS for CORS preflight', async () => {
            const result = await main({
                __ow_method: 'options',
                LOG_LEVEL: 'info'
            })

            expect(result.statusCode).toBe(200)
            expect(result.headers['Access-Control-Allow-Origin']).toBe('*')
            expect(result.headers['Access-Control-Allow-Methods']).toContain('POST')
        })
    })

    // --- Mode A: With actions.json ---

    describe('With actions.json', () => {
        beforeAll(() => installActionsJson())
        afterAll(() => removeActionsJson())

        describe('MCP Protocol', () => {
            test('should handle initialize request', async () => {
                const result = await mcpPost({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'initialize',
                    params: {
                        protocolVersion: '2024-11-05',
                        capabilities: {},
                        clientInfo: { name: 'test-client', version: '1.0.0' }
                    }
                })

                expect(result.statusCode).toBe(200)
                const body = JSON.parse(result.body)
                expect(body.jsonrpc).toBe('2.0')
                expect(body.id).toBe(1)
                expect(body.result.protocolVersion).toBe('2024-11-05')
                expect(body.result.serverInfo.name).toBe('llm-apps-poc')
            })

            test('should list all actions as tools', async () => {
                const result = await mcpPost({
                    jsonrpc: '2.0',
                    id: 2,
                    method: 'tools/list',
                    params: {}
                })

                expect(result.statusCode).toBe(200)
                const body = JSON.parse(result.body)
                expect(body.result.tools).toBeDefined()

                const toolNames = body.result.tools.map(t => t.name)
                expect(toolNames).toContain('echo')
                expect(toolNames).toContain('calculator')
                expect(toolNames).toContain('weather')
                expect(toolNames).toContain('eds-hello-world')
                expect(toolNames).toContain('showModels')
                expect(toolNames).toContain('no-handler-tool')
                expect(toolNames).toContain('no-handler-eds')
                expect(toolNames).toHaveLength(7)
            })

            test('tools should have descriptions from actions.json', async () => {
                const result = await mcpPost({
                    jsonrpc: '2.0',
                    id: 3,
                    method: 'tools/list',
                    params: {}
                })

                const body = JSON.parse(result.body)
                const weather = body.result.tools.find(t => t.name === 'weather')
                const echo = body.result.tools.find(t => t.name === 'echo')

                expect(weather.description).toBe('Get current weather information for any city.')
                expect(echo.description).toBe('A simple utility that echoes back the input message.')
            })

            test('tools should have inputSchema from actions.json', async () => {
                const result = await mcpPost({
                    jsonrpc: '2.0',
                    id: 4,
                    method: 'tools/list',
                    params: {}
                })

                const body = JSON.parse(result.body)
                const weather = body.result.tools.find(t => t.name === 'weather')
                const calc = body.result.tools.find(t => t.name === 'calculator')

                expect(weather.inputSchema.properties.city).toBeDefined()
                expect(weather.inputSchema.properties.city.type).toBe('string')
                expect(weather.inputSchema.required).toEqual(['city'])

                expect(calc.inputSchema.properties.expression).toBeDefined()
                expect(calc.inputSchema.properties.format.enum).toEqual(['decimal', 'scientific', 'fraction'])
            })

            test('tools should have annotations from actions.json', async () => {
                const result = await mcpPost({
                    jsonrpc: '2.0',
                    id: 5,
                    method: 'tools/list',
                    params: {}
                })

                const body = JSON.parse(result.body)
                const weather = body.result.tools.find(t => t.name === 'weather')
                const echo = body.result.tools.find(t => t.name === 'echo')

                expect(weather.annotations.readOnlyHint).toBe(true)
                expect(weather.annotations.openWorldHint).toBe(true)
                expect(echo.annotations.readOnlyHint).toBe(true)
                expect(echo.annotations.idempotentHint).toBe(true)
            })

            test('weather tool should have full _meta with UI and OpenAI keys', async () => {
                const result = await mcpPost({
                    jsonrpc: '2.0',
                    id: 6,
                    method: 'tools/list',
                    params: {}
                })

                const body = JSON.parse(result.body)
                const weather = body.result.tools.find(t => t.name === 'weather')

                expect(weather._meta).toBeDefined()
                expect(weather._meta.ui.resourceUri).toBe('ui://weather/widget.html')
                expect(weather._meta.ui.visibility).toEqual(['model', 'app'])
                expect(weather._meta['ui/resourceUri']).toBe('ui://weather/widget.html')
                expect(weather._meta['openai/outputTemplate']).toBe('ui://weather/widget.html')
                expect(weather._meta['openai/resultCanProduceWidget']).toBe(true)
                expect(weather._meta['openai/toolInvocation/invoking']).toBe('Fetching weather data...')
                expect(weather._meta['openai/widgetAccessible']).toBe(true)
            })

            test('echo and calculator tools should NOT have _meta.ui', async () => {
                const result = await mcpPost({
                    jsonrpc: '2.0',
                    id: 7,
                    method: 'tools/list',
                    params: {}
                })

                const body = JSON.parse(result.body)
                const echoTool = body.result.tools.find(t => t.name === 'echo')
                const calcTool = body.result.tools.find(t => t.name === 'calculator')

                expect(echoTool._meta?.ui?.resourceUri).toBeUndefined()
                expect(calcTool._meta?.ui?.resourceUri).toBeUndefined()
            })
        })

        describe('Tool Calls', () => {
            test('echo tool should return echoed message', async () => {
                const result = await mcpPost({
                    jsonrpc: '2.0',
                    id: 10,
                    method: 'tools/call',
                    params: { name: 'echo', arguments: { message: 'Hello, test!' } }
                })

                expect(result.statusCode).toBe(200)
                const body = JSON.parse(result.body)
                expect(body.result.content[0].text).toContain('Hello, test!')
            })

            test('calculator tool should evaluate expressions', async () => {
                const result = await mcpPost({
                    jsonrpc: '2.0',
                    id: 11,
                    method: 'tools/call',
                    params: { name: 'calculator', arguments: { expression: '2 + 3 * 4' } }
                })

                expect(result.statusCode).toBe(200)
                const body = JSON.parse(result.body)
                expect(body.result.content[0].text).toContain('14')
            })

            test('weather tool should return content and structuredContent', async () => {
                const result = await mcpPost({
                    jsonrpc: '2.0',
                    id: 12,
                    method: 'tools/call',
                    params: { name: 'weather', arguments: { city: 'San Francisco' } }
                })

                expect(result.statusCode).toBe(200)
                const body = JSON.parse(result.body)

                expect(body.result.content).toBeDefined()
                expect(body.result.content[0].text).toContain('Weather for San Francisco')
                expect(body.result.content[0].text).toContain('Temperature:')
                expect(body.result.content[0].text).toContain('°C')

                expect(body.result.structuredContent).toBeDefined()
                expect(body.result.structuredContent.city).toBe('San Francisco')
                expect(typeof body.result.structuredContent.temperature).toBe('number')
                expect(typeof body.result.structuredContent.humidity).toBe('number')
            })

            test('unknown tool should return error', async () => {
                const result = await mcpPost({
                    jsonrpc: '2.0',
                    id: 13,
                    method: 'tools/call',
                    params: { name: 'nonexistent_tool', arguments: {} }
                })

                expect(result.statusCode).toBe(200)
                const body = JSON.parse(result.body)
                expect(body.result.isError).toBe(true)
                expect(body.result.content[0].text).toContain('Tool nonexistent_tool not found')
            })
        })

        describe('Widget Resources', () => {
            test('should list widget resources', async () => {
                const result = await mcpPost({
                    jsonrpc: '2.0',
                    id: 20,
                    method: 'resources/list',
                    params: {}
                })

                expect(result.statusCode).toBe(200)
                const body = JSON.parse(result.body)
                expect(body.result.resources).toBeDefined()

                const weatherResource = body.result.resources.find(
                    r => r.uri === 'ui://weather/widget.html'
                )
                expect(weatherResource).toBeDefined()
                expect(weatherResource.mimeType).toBe('text/html;profile=mcp-app')
            })

            test('should serve widget HTML via resources/read', async () => {
                const result = await mcpPost({
                    jsonrpc: '2.0',
                    id: 21,
                    method: 'resources/read',
                    params: { uri: 'ui://weather/widget.html' }
                })

                expect(result.statusCode).toBe(200)
                const body = JSON.parse(result.body)
                expect(body.result.contents).toBeDefined()
                expect(body.result.contents.length).toBe(1)

                const content = body.result.contents[0]
                expect(content.uri).toBe('ui://weather/widget.html')
                expect(content.mimeType).toBe('text/html;profile=mcp-app')
                expect(content.text).toContain('<!DOCTYPE html>')
                expect(content.text).toContain('McpApp')
                expect(content.text).toContain('Weather Widget')
            })

            test('widget resource should include _meta.ui with prefersBorder', async () => {
                const result = await mcpPost({
                    jsonrpc: '2.0',
                    id: 22,
                    method: 'resources/read',
                    params: { uri: 'ui://weather/widget.html' }
                })

                const body = JSON.parse(result.body)
                const content = body.result.contents[0]
                expect(content._meta).toBeDefined()
                expect(content._meta.ui).toBeDefined()
                expect(content._meta.ui.prefersBorder).toBe(true)
            })
        })

        describe('EDS Widget', () => {
            test('EDS action should be registered as a tool with widget metadata', async () => {
                const result = await mcpPost({
                    jsonrpc: '2.0',
                    id: 40,
                    method: 'tools/list',
                    params: {}
                })

                const body = JSON.parse(result.body)
                const edsTool = body.result.tools.find(t => t.name === 'eds-hello-world')

                expect(edsTool).toBeDefined()
                expect(edsTool.description).toBe('Browse the Adobe merchandise shirt catalog.')
                expect(edsTool._meta).toBeDefined()
                expect(edsTool._meta.ui.resourceUri).toBe('ui://eds-hello-world/widget.html')
                expect(edsTool._meta['openai/outputTemplate']).toBe('ui://eds-hello-world/widget.html')
                expect(edsTool._meta['openai/resultCanProduceWidget']).toBe(true)
            })

            test('EDS widget resource should appear in resources/list', async () => {
                const result = await mcpPost({
                    jsonrpc: '2.0',
                    id: 41,
                    method: 'resources/list',
                    params: {}
                })

                const body = JSON.parse(result.body)
                const edsResource = body.result.resources.find(
                    r => r.uri === 'ui://eds-hello-world/widget.html'
                )
                expect(edsResource).toBeDefined()
                expect(edsResource.mimeType).toBe('text/html;profile=mcp-app')
            })

            test('EDS widget HTML should contain aem-embed element', async () => {
                const result = await mcpPost({
                    jsonrpc: '2.0',
                    id: 42,
                    method: 'resources/read',
                    params: { uri: 'ui://eds-hello-world/widget.html' }
                })

                const body = JSON.parse(result.body)
                const content = body.result.contents[0]

                expect(content.uri).toBe('ui://eds-hello-world/widget.html')
                expect(content.mimeType).toBe('text/html;profile=mcp-app')
                expect(content.text).toContain('<aem-embed')
                expect(content.text).toContain('url="https://main--eds-01--posabogdanpetre.aem.page/eds-widgets/adobe-shirts"')
                expect(content.text).toContain('src="https://main--eds-01--posabogdanpetre.aem.page/scripts/aem-embed.js"')
            })

            test('EDS widget resource should include _meta.ui with CSP', async () => {
                const result = await mcpPost({
                    jsonrpc: '2.0',
                    id: 43,
                    method: 'resources/read',
                    params: { uri: 'ui://eds-hello-world/widget.html' }
                })

                const body = JSON.parse(result.body)
                const content = body.result.contents[0]

                expect(content._meta).toBeDefined()
                expect(content._meta.ui).toBeDefined()
                expect(content._meta.ui.csp).toBeDefined()
                expect(content._meta.ui.csp.connectDomains).toContain('https://main--eds-01--posabogdanpetre.aem.page')
                expect(content._meta.ui.csp.resourceDomains).toContain('https://main--eds-01--posabogdanpetre.aem.page')
            })

            test('EDS tool handler should return shirt catalog', async () => {
                const result = await mcpPost({
                    jsonrpc: '2.0',
                    id: 44,
                    method: 'tools/call',
                    params: { name: 'eds-hello-world', arguments: {} }
                })

                expect(result.statusCode).toBe(200)
                const body = JSON.parse(result.body)
                expect(body.result.content[0].text).toContain('12 Adobe shirts')
                expect(body.result.structuredContent).toBeDefined()
                expect(body.result.structuredContent.shirts).toHaveLength(12)
                expect(body.result.structuredContent.shirts[0].id).toBe('button-up-carly-berry')
            })
        })

        describe('Handler-less Actions (config-driven, no /actions/ folder)', () => {
            test('handler-less tool should appear in tools/list with config metadata', async () => {
                const result = await mcpPost({
                    jsonrpc: '2.0',
                    id: 50,
                    method: 'tools/list',
                    params: {}
                })

                const body = JSON.parse(result.body)
                const tool = body.result.tools.find(t => t.name === 'no-handler-tool')

                expect(tool).toBeDefined()
                expect(tool.description).toBe('Action defined in config only, no handler folder exists.')
                expect(tool.annotations.readOnlyHint).toBe(true)
                expect(tool.inputSchema.properties.query).toBeDefined()
            })

            test('handler-less tool should return empty content and structuredContent', async () => {
                const result = await mcpPost({
                    jsonrpc: '2.0',
                    id: 51,
                    method: 'tools/call',
                    params: { name: 'no-handler-tool', arguments: {} }
                })

                expect(result.statusCode).toBe(200)
                const body = JSON.parse(result.body)
                expect(body.result.content).toBeDefined()
                expect(body.result.content[0].text).toBe('')
                expect(body.result.structuredContent).toEqual({})
            })

            test('handler-less EDS action should have widget metadata', async () => {
                const result = await mcpPost({
                    jsonrpc: '2.0',
                    id: 52,
                    method: 'tools/list',
                    params: {}
                })

                const body = JSON.parse(result.body)
                const tool = body.result.tools.find(t => t.name === 'no-handler-eds')

                expect(tool).toBeDefined()
                expect(tool._meta).toBeDefined()
                expect(tool._meta.ui.resourceUri).toBe('ui://no-handler-eds/widget.html')
                expect(tool._meta['openai/outputTemplate']).toBe('ui://no-handler-eds/widget.html')
                expect(tool._meta['openai/resultCanProduceWidget']).toBe(true)
            })

            test('handler-less EDS widget resource should be served', async () => {
                const result = await mcpPost({
                    jsonrpc: '2.0',
                    id: 53,
                    method: 'resources/read',
                    params: { uri: 'ui://no-handler-eds/widget.html' }
                })

                expect(result.statusCode).toBe(200)
                const body = JSON.parse(result.body)
                const content = body.result.contents[0]

                expect(content.uri).toBe('ui://no-handler-eds/widget.html')
                expect(content.mimeType).toBe('text/html;profile=mcp-app')
                expect(content.text).toContain('<aem-embed')
                expect(content.text).toContain('url="https://main--eds-01--posabogdanpetre.aem.page/eds-widgets/no-handler-test"')
            })

            test('handler-less EDS widget resource should have CSP metadata', async () => {
                const result = await mcpPost({
                    jsonrpc: '2.0',
                    id: 54,
                    method: 'resources/read',
                    params: { uri: 'ui://no-handler-eds/widget.html' }
                })

                const body = JSON.parse(result.body)
                const content = body.result.contents[0]

                expect(content._meta).toBeDefined()
                expect(content._meta.ui.csp).toBeDefined()
                expect(content._meta.ui.csp.connectDomains).toContain('https://main--eds-01--posabogdanpetre.aem.page')
            })

            test('handler-less EDS tool should return empty content when called', async () => {
                const result = await mcpPost({
                    jsonrpc: '2.0',
                    id: 55,
                    method: 'tools/call',
                    params: { name: 'no-handler-eds', arguments: {} }
                })

                expect(result.statusCode).toBe(200)
                const body = JSON.parse(result.body)
                expect(body.result.content[0].text).toBe('')
                expect(body.result.structuredContent).toEqual({})
            })

            test('handler-less tool should NOT have _meta.ui (no widget)', async () => {
                const result = await mcpPost({
                    jsonrpc: '2.0',
                    id: 56,
                    method: 'tools/list',
                    params: {}
                })

                const body = JSON.parse(result.body)
                const tool = body.result.tools.find(t => t.name === 'no-handler-tool')
                expect(tool._meta?.ui?.resourceUri).toBeUndefined()
            })
        })
    })

    // --- Mode B: Without actions.json ---

    describe('Without actions.json (handler-only defaults)', () => {
        beforeAll(() => removeActionsJson())

        test('should list all actions as tools with folder-name descriptions', async () => {
            const result = await mcpPost({
                jsonrpc: '2.0',
                id: 30,
                method: 'tools/list',
                params: {}
            })

            expect(result.statusCode).toBe(200)
            const body = JSON.parse(result.body)

            const toolNames = body.result.tools.map(t => t.name)
            expect(toolNames).toContain('echo')
            expect(toolNames).toContain('calculator')
            expect(toolNames).toContain('weather')
            expect(toolNames).toContain('eds-hello-world')
            expect(toolNames).toContain('showModels')
            expect(toolNames).toHaveLength(5)

            const echo = body.result.tools.find(t => t.name === 'echo')
            expect(echo.description).toBe('echo')
        })

        test('tools should not have annotations without config', async () => {
            const result = await mcpPost({
                jsonrpc: '2.0',
                id: 31,
                method: 'tools/list',
                params: {}
            })

            const body = JSON.parse(result.body)
            const echo = body.result.tools.find(t => t.name === 'echo')
            expect(echo.annotations).toBeUndefined()
        })

        test('tools should have empty inputSchema without config or inline schema', async () => {
            const result = await mcpPost({
                jsonrpc: '2.0',
                id: 32,
                method: 'tools/list',
                params: {}
            })

            const body = JSON.parse(result.body)
            const echo = body.result.tools.find(t => t.name === 'echo')
            // SDK defaults to empty object schema when no inputSchema provided
            expect(echo.inputSchema).toBeDefined()
            expect(echo.inputSchema.type).toBe('object')
            expect(Object.keys(echo.inputSchema.properties || {})).toHaveLength(0)
        })

        test('weather tool should still have _meta.ui.resourceUri (auto-generated for widgets)', async () => {
            const result = await mcpPost({
                jsonrpc: '2.0',
                id: 33,
                method: 'tools/list',
                params: {}
            })

            const body = JSON.parse(result.body)
            const weather = body.result.tools.find(t => t.name === 'weather')
            expect(weather._meta).toBeDefined()
            expect(weather._meta.ui.resourceUri).toBe('ui://weather/widget.html')
            expect(weather._meta['openai/outputTemplate']).toBe('ui://weather/widget.html')
        })

        test('weather tool should NOT have visibility without config', async () => {
            const result = await mcpPost({
                jsonrpc: '2.0',
                id: 34,
                method: 'tools/list',
                params: {}
            })

            const body = JSON.parse(result.body)
            const weather = body.result.tools.find(t => t.name === 'weather')
            expect(weather._meta.ui.visibility).toBeUndefined()
        })

        test('widget resource should NOT have _meta without config', async () => {
            const result = await mcpPost({
                jsonrpc: '2.0',
                id: 35,
                method: 'resources/read',
                params: { uri: 'ui://weather/widget.html' }
            })

            const body = JSON.parse(result.body)
            const content = body.result.contents[0]
            expect(content._meta).toBeUndefined()
        })

        test('handler is callable without config (uses default args)', async () => {
            const result = await mcpPost({
                jsonrpc: '2.0',
                id: 36,
                method: 'tools/call',
                params: { name: 'echo', arguments: {} }
            })

            expect(result.statusCode).toBe(200)
            const body = JSON.parse(result.body)
            // Without schema, SDK strips unknown args; handler uses defaults
            expect(body.result.content[0].text).toContain('No message provided')
        })

        test('EDS action should be tool-only without actions.json (no widget)', async () => {
            const result = await mcpPost({
                jsonrpc: '2.0',
                id: 37,
                method: 'tools/list',
                params: {}
            })

            const body = JSON.parse(result.body)
            const edsTool = body.result.tools.find(t => t.name === 'eds-hello-world')
            expect(edsTool).toBeDefined()
            expect(edsTool._meta?.ui?.resourceUri).toBeUndefined()
        })
    })

    // --- Error Handling ---

    describe('Error Handling', () => {
        test('should handle invalid JSON body', async () => {
            const result = await main({
                __ow_method: 'post',
                __ow_body: 'invalid json',
                __ow_headers: {
                    'content-type': 'application/json',
                    accept: 'application/json;q=1.0, text/event-stream;q=0.5'
                },
                LOG_LEVEL: 'info'
            })

            expect(result.statusCode).toBe(500)
            const body = JSON.parse(result.body)
            expect(body.jsonrpc).toBe('2.0')
            expect(body.error).toBeDefined()
        })

        test('should reject unsupported HTTP method', async () => {
            const result = await main({
                __ow_method: 'put',
                LOG_LEVEL: 'info'
            })

            expect(result.statusCode).toBe(405)
        })
    })
})
