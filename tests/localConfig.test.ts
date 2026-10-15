import { test } from "node:test";
import assert from "node:assert/strict";
import { allowedOrigin, serverPorts, uploadUrl } from "../src/portal/localConfig";
import type {Request} from "express";
test("development accepts loopback ports without opening CORS to remote sites",()=>{
 for(const origin of ["http://localhost:5173","http://127.0.0.1:5175","http://[::1]:5180"])assert.equal(allowedOrigin(origin,false),true);
 for(const origin of ["http://localhost.evil.test:5173","http://192.168.0.2:5173","https://example.test","null"])assert.equal(allowedOrigin(origin,false),false);
 assert.equal(allowedOrigin("http://127.0.0.1:5999",true),false);
});
test("explicit CLI ports, multiple listeners and upload URLs respect the actual instance",()=>{
 assert.deepEqual(serverPorts(["--port","3334"]),[3334]);assert.deepEqual(serverPorts(["--port=3334,3335"]),[3334,3335]);
 assert.throws(()=>serverPorts(["--port","0"]));assert.throws(()=>serverPorts(["--port"]));assert.throws(()=>serverPorts(["--port","oops"]));
 const previous=process.env.PUBLIC_API_URL;delete process.env.PUBLIC_API_URL;
 assert.equal(uploadUrl({socket:{localPort:3334}} as Request,"test.png"),"http://127.0.0.1:3334/uploads/test.png");
 if(previous!==undefined)process.env.PUBLIC_API_URL=previous;
});
