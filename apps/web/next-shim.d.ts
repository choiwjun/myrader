declare module "next" {
  export type Metadata = Record<string, unknown>;
  export type Viewport = Record<string, unknown>;
}

declare module "next/headers" {
  export interface CookieValue {
    readonly name: string;
    readonly value: string;
  }

  export interface CookieStore {
    get(name: string): CookieValue | undefined;
    set(name: string, value: string, options?: CookieOptions): void;
    delete(name: string): void;
  }

  export interface CookieOptions {
    readonly httpOnly?: boolean;
    readonly secure?: boolean;
    readonly sameSite?: "strict" | "lax" | "none" | boolean;
    readonly maxAge?: number;
    readonly path?: string;
  }

  export function cookies(): Promise<CookieStore>;
}

declare module "next/server" {
  export class NextRequest extends Request {
    readonly cookies: {
      get(name: string): { readonly value: string } | undefined;
    };
    readonly nextUrl: URL & { clone(): URL };
  }

  export class NextResponse<Body = unknown> extends Response {
    static json<JsonBody>(body: JsonBody, init?: ResponseInit): NextResponse<JsonBody>;
    static redirect(url: string | URL, init?: number | ResponseInit): NextResponse;
    static next(init?: ResponseInit): NextResponse;
  }
}
