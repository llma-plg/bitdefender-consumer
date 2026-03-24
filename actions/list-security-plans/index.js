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
 * List Security Plans Action
 *
 * Retrieves all available Bitdefender consumer security subscription plans
 * including Individual and Family tiers. Returns an array of plan objects
 * with name, pricing, key features, and category.
 */

const SECURITY_PLANS = [
    {
        name: 'Bitdefender Antivirus Plus',
        price: 'RON 79.99/yr',
        original_price: null,
        discount_percentage: null,
        category: 'Device Security',
        device_count: 1,
        key_features: [
            'Basic antivirus protection',
            'Ransomware defense',
            'Web protection',
            'Low system impact',
            'Multi-platform support (Windows, macOS, Android, iOS)'
        ],
        image_url: 'https://www.bitdefender.com/ro-ro/consumer/media_1574abaa0bf90cc5df3ccb6ba8d7a4b7875c232d1.jpg?width=1200&format=pjpg&optimize=medium'
    },
    {
        name: 'Bitdefender Total Security',
        price: 'RON 199.99/yr',
        original_price: null,
        discount_percentage: null,
        category: 'All-in-One',
        device_count: 5,
        key_features: [
            'Complete protection for up to 5 devices',
            'AI-powered antimalware',
            'Password Manager',
            '200 MB/day VPN'
        ],
        image_url: 'https://www.bitdefender.com/ro-ro/consumer/media_1f7211670a76d505f7f2270ba9d070ec66ef20866.png?width=1200&format=pjpg&optimize=medium'
    },
    {
        name: 'Bitdefender Premium Security',
        price: 'RON 279.98/yr',
        original_price: null,
        discount_percentage: null,
        category: 'All-in-One',
        device_count: 10,
        key_features: [
            'Most popular plan',
            'Unlimited VPN',
            'AI-powered Scam Protection',
            'Anti-tracker',
            'Email protection',
            'Password Manager'
        ],
        image_url: 'https://www.bitdefender.com/ro-ro/consumer/media_1ccdcc217e7bfcf08e76a61cdc33bf215941bcf72.jpg?width=1200&format=pjpg&optimize=medium'
    },
    {
        name: 'Bitdefender Ultimate Security',
        price: 'RON 349.99/yr',
        original_price: null,
        discount_percentage: null,
        category: 'All-in-One',
        device_count: 10,
        key_features: [
            'Top-tier plan',
            'Digital Identity Protection',
            'Continuous Dark Web monitoring',
            'Real-time breach alerts',
            'Expert security recommendations'
        ],
        image_url: 'https://www.bitdefender.com/ro-ro/consumer/media_10c4872a79f57d7245660dc9f8bd7455ad0dbea48.jpg?width=1200&format=pjpg&optimize=medium'
    },
    {
        name: 'Bitdefender Premium VPN',
        price: 'RON 289.99/yr',
        original_price: null,
        discount_percentage: null,
        category: 'Privacy',
        device_count: 10,
        key_features: [
            'Standalone VPN',
            'Unlimited encrypted traffic',
            'Up to 10 devices',
            '3000+ servers in 100+ countries',
            'Strict no-logs policy'
        ],
        image_url: 'https://www.bitdefender.com/ro-ro/consumer/media_136904bddcf087babb6d5ca9076f0cc7173b505b7.png?width=1200&format=pjpg&optimize=medium'
    }
]

module.exports = async ({ category, plan_type } = {}) => {
    try {
        let filteredPlans = SECURITY_PLANS

        // Filter by category if provided
        if (category) {
            const categoryLower = category.toLowerCase()
            filteredPlans = filteredPlans.filter(plan =>
                plan.category.toLowerCase().includes(categoryLower)
            )
        }

        // Filter by plan type (individual vs family) based on device count
        if (plan_type) {
            const typeLower = plan_type.toLowerCase()
            if (typeLower === 'individual') {
                filteredPlans = filteredPlans.filter(plan => plan.device_count <= 1)
            } else if (typeLower === 'family') {
                filteredPlans = filteredPlans.filter(plan => plan.device_count > 1)
            }
        }

        if (filteredPlans.length === 0) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `No security plans found matching the specified criteria${category ? ` (category: ${category})` : ''}${plan_type ? ` (type: ${plan_type})` : ''}.`
                    }
                ],
                structuredContent: []
            }
        }

        let summaryText = `Found ${filteredPlans.length} Bitdefender security plan${filteredPlans.length === 1 ? '' : 's'}`
        if (category) summaryText += ` in category "${category}"`
        if (plan_type) summaryText += ` for ${plan_type} use`
        summaryText += '. Plans range from basic antivirus protection to comprehensive all-in-one security suites with VPN, password management, and identity protection.'

        return {
            content: [
                {
                    type: 'text',
                    text: summaryText
                }
            ],
            structuredContent: filteredPlans
        }
    } catch (error) {
        return {
            content: [
                {
                    type: 'text',
                    text: `Error retrieving security plans: ${error.message}`
                }
            ],
            structuredContent: []
        }
    }
}
