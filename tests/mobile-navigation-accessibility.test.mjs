import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const html=readFileSync('index.html','utf8');
const css=readFileSync('css/styles.css','utf8');
test('mobile primary navigation exposes five named destinations',()=>{for(const id of ['today','calendar','training','analysis','more'])assert.match(html,new RegExp('id="mobile-nav-'+id+'"'));assert.match(html,/aria-label="Hauptnavigation mobil"/);});
test('mobile primary and sub-navigation provide at least 44px touch targets',()=>{assert.match(css,/\.kajo-mobile-nav \.kajo-mobile-nav-item\s*\{[^}]*min-height:\s*44px/s);assert.match(css,/#app-main \.kajo-subnav-item\s*\{[^}]*min-height:\s*44px/s);});
test('mobile navigation provides visible keyboard focus indicators',()=>assert.match(css,/\.kajo-mobile-nav-item:focus-visible,[\s\S]*?\.kajo-subnav-item:focus-visible\s*\{[^}]*outline:\s*2px solid/s));
