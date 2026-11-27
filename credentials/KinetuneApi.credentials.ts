import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

/** Kept to the package version (a test checks it). */
export const USER_AGENT = 'n8n-nodes-kinetune/6.4.0';

export class KinetuneApi implements ICredentialType {
	name = 'kinetuneApi';
	displayName = 'Kinetune API';
	icon: Icon = { light: 'file:kinetune.svg', dark: 'file:kinetune.svg' };
	documentationUrl = 'https://kinetune.com/developers#n8n';
	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
		},
		{
			displayName: 'API Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://kinetune.com',
			description: 'The app address: it serves the API at /api/v1',
			required: true,
		},
	];
	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		// The User-Agent names this node and its version, so the API's logs can tell who still calls something deprecated.
		properties: {
			headers: { Authorization: '=Bearer {{$credentials.apiKey}}', 'User-Agent': USER_AGENT },
		},
	};
	// Checks the key: GET /api/v1/account answers 200 with a valid key, 401 without.
	test: ICredentialTestRequest = {
		request: { baseURL: '={{$credentials.baseUrl}}', url: '/api/v1/account', method: 'GET' },
	};
}
