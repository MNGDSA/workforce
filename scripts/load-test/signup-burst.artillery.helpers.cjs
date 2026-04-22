"use strict";
const crypto = require("crypto");

function genIdentity(context, events, done) {
  const r = crypto.randomBytes(8).readBigUInt64BE();
  const phoneSuffix = (r % 1_000_000_000n).toString().padStart(9, "0");
  const nidSuffix = ((r >> 8n) % 100_000_000n).toString().padStart(8, "0");
  context.vars.phone = `057${phoneSuffix.slice(0, 7)}`;
  context.vars.nid = `29${nidSuffix}`;
  return done();
}

module.exports = { genIdentity };
