import assert from "node:assert/strict";
import { decodeHtmlEntities } from "../src/lib/html-entities.ts";

assert.equal(decodeHtmlEntities("Gr&uuml;&szlig;e"), "Grüße");
assert.equal(decodeHtmlEntities("&auml; &ouml; &uuml; &szlig; &Auml; &Ouml; &Uuml;"), "ä ö ü ß Ä Ö Ü");
assert.equal(decodeHtmlEntities("&raquo; Konto"), "» Konto");
assert.equal(decodeHtmlEntities("&#252; &#xFC; &#xfc;"), "ü ü ü");
assert.equal(decodeHtmlEntities("&amp;uuml;"), "ü");
assert.equal(decodeHtmlEntities("&amp;amp;"), "&");
assert.equal(decodeHtmlEntities("Hallo"), "Hallo");
assert.equal(decodeHtmlEntities("&foo;"), "&foo;");
assert.equal(decodeHtmlEntities("&lt;b&gt;"), "<b>");
assert.equal(decodeHtmlEntities("a&nbsp;b"), "a b");
assert.equal(decodeHtmlEntities("&#0;&#x0;"), "&#0;&#x0;");

console.log("html entity checks ok");
