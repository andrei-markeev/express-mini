import http from 'http';
import path from 'path';
import fs from 'fs';
import url from 'url';
import { createEndpoint, EndpointResponse, GetEndpointParams, PostEndpointParams, PreprocessedRequest } from './endpoint';
export * from './endpoint';

type Route = { template: string, endpoint: ReturnType<typeof createEndpoint> };

const routes = new Map<string, Route[]>();
routes.set("GET", []);
routes.set("POST", []);

export function get<P>(template: string, endpointFunction: (params: GetEndpointParams<P>) => Promise<EndpointResponse>) {
    routes.get("GET")!.push({ template, endpoint: createEndpoint({ get: endpointFunction }) });
}
export function post<P, B>(template: string, endpointFunction: (params: PostEndpointParams<P, B>) => Promise<EndpointResponse>) {
    routes.get("POST")!.push({ template, endpoint: createEndpoint({ post: endpointFunction }) })
}

function preprocessRequest(request: http.IncomingMessage, response: http.ServerResponse) {

    if (request.method === "GET" && request.url === "/_health") {
        response.writeHead(200, { 'Content-Type': 'text/plain' });
        response.end("I'm feeling fine!");
        return;
    }

    console.log(request.method, request.url);

    const cookies: { [key: string]: string } = {};
    if (request.headers.cookie) {
        for (const cookie of request.headers.cookie.split(';')) {
            const match = cookie.match(/^\s*([^=]+)=\s*(.*?)\s*$/);
            if (match)
                cookies[match[1]] = match[2];
        }
    }
    const parsedUrl = url.parse(request.url || "/");
    const preprocessed = request as PreprocessedRequest;
    preprocessed.url = parsedUrl.pathname!;
    preprocessed.query = new URLSearchParams(parsedUrl.query || "");
    preprocessed.cookies = cookies;
    preprocessed.body = null;
    preprocessed.rawBody = null;
    preprocessed.params = {};

    if (request.method == 'POST') {
        var body = '';

        request.on('data', function (data) {
            body += data;

            if (body.length > 100000) {
                response.writeHead(500);
                response.end('Internal server error');
                request.socket.destroy();
            }
        });

        request.on('end', function () {
            preprocessed.rawBody = body;
            if (request.headers["content-type"] === "application/x-www-form-urlencoded") {
                const params = new URLSearchParams(body);
                const bodyAsObject: Record<string, string> = {};
                for (const [key, value] of params.entries()) {
                    bodyAsObject[key] = value;
                }
                preprocessed.body = bodyAsObject;
            }
            else if (request.headers["content-type"] === "application/json")
                preprocessed.body = JSON.parse(body);
            else
                preprocessed.body = body;

            matchRoute(preprocessed, response);
        });
    } else
        matchRoute(preprocessed, response);
}

function matchRoute(request: PreprocessedRequest, response: http.ServerResponse) {
    const url = request.url;
    if (!url)
        return;

    console.log(request.query);
    console.log(request.body);

    var filePath = './public/' + url.replace(/^[\.\/\\]+/, "");
    if (filePath.endsWith('/')) {
        filePath += 'index.html';
    }
    fs.access(filePath, fs.constants.F_OK, async (err) => {
        if (!err)
            return getStaticFile(filePath, response);

        const method = request.method || "GET";
        const routesByMethod = routes.get(method) || [];
        for (const route of routesByMethod) {
            if (parseRouteAndAddParamsToRequest(route.template, url, request)) {
                const result = await route.endpoint(request, response);
                if (result === "handled")
                    return;
            }
        }

        response.writeHead(404, { 'Content-Type': 'text/plain' });
        response.end("Not found");
    });

}

function parseRouteAndAddParamsToRequest(template: string, url: string, request: PreprocessedRequest) {
    const paramNamesMatch = template.match(/\/:[A-Za-z_]+/g);
    if (paramNamesMatch) {
        const regex = new RegExp("^" + template.replace(/\/:[A-Za-z_]+/g, "/([^/]+)") + "$");
        const match = url.match(regex);
        if (match) {
            let i = 1;
            while (match[i]) {
                request.params[paramNamesMatch[i - 1].slice(2)] = match[i];
                i++;
            }
            return true;
        }
    }
    return template === url;
}

export function getStaticFile(filePath: string, response: http.ServerResponse) {
    var extname = String(path.extname(filePath)).toLowerCase();
    var mimeTypes: { [ext: string]: string } = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.png': 'image/png',
        '.jpg': 'image/jpg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml'
    };

    var contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(filePath, function (error, content) {
        if (error) {
            if (error.code == 'ENOENT') {
                response.writeHead(404, { 'Content-Type': 'text/plain' });
                response.end("File not found");
            }
            else {
                response.writeHead(500);
                response.end('Internal server error');
            }
        } else {
            response.writeHead(200, { 'Content-Type': contentType });
            response.end(content, 'utf-8');
        }
    });

}

export function listen(port: number, callback?: () => void) {
    return http.createServer(preprocessRequest)
        .listen(port, callback);
}