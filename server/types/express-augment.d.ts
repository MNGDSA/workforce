// Module augmentations that narrow Express's request typing so the
// route handlers in `server/routes.ts` don't have to coerce
// `req.params.id` and `req.query.foo` from `string | string[]` on every
// access. The platform never wires up array params or array query
// values for these routes (we don't use `:id*` style routes and our
// query strings are always single-valued), so narrowing the dictionary
// types is a faithful reflection of how the API actually behaves.

import "express-serve-static-core";
import "qs";

declare module "express-serve-static-core" {
  interface ParamsDictionary {
    [key: string]: string;
    [key: number]: string;
  }
}

declare module "qs" {
  interface ParsedQs {
    [key: string]: string | undefined;
  }
}
