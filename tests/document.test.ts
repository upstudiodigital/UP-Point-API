import {test} from "node:test";
import assert from "node:assert/strict";
import {validDocument} from "../src/portal/document";
test("CPF/CNPJ: check digits, formatting and invalid input", () => {
  assert.equal(validDocument("529.982.247-25"),true);
  assert.equal(validDocument("11.222.333/0001-81"),true);
  for(const value of [null, "", "11111111111", "00000000000000", "52998224724", "11222333000180", "52998224725x", "123"]) assert.equal(validDocument(value),false);
});
