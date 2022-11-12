import { ServerResponse, IncomingMessage } from "http";

interface EndpointParamsBase<P> {
    userAgent: string;
    host: string;
    url: string;
    params: StringValues<P>;
    cookies: Record<string, string>;
    headers: Record<string, string | string[] | undefined>;
}
export interface PostEndpointParams<B, P = never> extends EndpointParamsBase<P> {
    body: Untrusted<B>;
    rawBody: string | null;
}

export interface GetEndpointParams<P = never> extends EndpointParamsBase<P> {
    query: URLSearchParams;
}

export type PreprocessedRequest = IncomingMessage & {
    query: URLSearchParams;
    cookies: { [key: string]: string; };
    body: any;
    rawBody: string | null;
    params: any;
}

type Untrusted<T> = {
    [P in keyof T]?: any;
};

type StringValues<T> = {
    [P in keyof T]: string;
};

export type EndpointResponse = { html: string }
    | { redirectTo: string; setCookies?: string[]; }
    | { text: string; }
    | { code?: number; }
    | { skip: true };

export function createEndpoint<B, P>(options: {
    post?: (params: PostEndpointParams<B, P>) => Promise<EndpointResponse>,
    get?: (params: GetEndpointParams<P>) => Promise<EndpointResponse>,
}) {
    return async function (request: PreprocessedRequest, response: ServerResponse): Promise<"handled" | "next"> {
        const now = Date.now();
        console.time("Endpoint-" + now);

        const host = request.headers.host!;
        const userAgent = request.headers["user-agent"] || "";

        const body = request.body;
        const rawBody = request.rawBody;
        const query = request.query;
        const params = request.params;
        const cookies = request.cookies;
        const headers = request.headers;
        const url = request.url!;

        let result;
        try {
            console.time("Handler-" + now);
            if (request.method === "POST" && options.post)
                result = await options.post({ params, headers, cookies, body, rawBody, userAgent, host, url });
            else if (request.method === "GET" && options.get)
                result = await options.get({ params, headers, cookies, query, userAgent, host, url });
            else
                result = { code: 400 };
            console.timeEnd("Handler-" + now);
        } catch (e) {
            let code = 500;
            let message = "Internal server error";
            let headers: Record<string, string> = { "Content-Type": "text/plain" };
            if (e instanceof EndpointError) {
                code = e.code;
                if (e.headers)
                    headers = e.headers;
                message = e.message;
            } else
                console.warn(e);

            response.writeHead(code, headers);
            response.end(message);
            console.timeEnd("Handler-" + now);
            console.timeEnd("Endpoint-" + now);
            return "handled";
        }

        if ("skip" in result && result.skip) {
            console.timeEnd("Endpoint-" + now);
            return "next";
        }

        if ("code" in result && result.code) {
            response.writeHead(result.code);
            response.end();
        } else if ("html" in result) {
            response.writeHead(200, { "Content-Type": "text/html" });
            response.end("<!DOCTYPE html>\n" + result.html);
        } else if ("text" in result) {
            response.writeHead(200, { "Content-Type": "text/plain" });
            response.end(result.text);
        } else if ("redirectTo" in result) {

            const headers: any = { "Location": result.redirectTo };

            if ("setCookies" in result && result.setCookies) {
                headers["Set-Cookie"] = result.setCookies;
            }

            response.writeHead(302, headers);
            response.end();
        } else {
            response.writeHead(204);
            response.end();
        }
        console.timeEnd("Endpoint-" + now);
        return "handled";
    }
}

export class EndpointError extends Error {
    constructor(public code: number, text?: string, public headers?: Record<string, string>) {
        super(text);
    }
}