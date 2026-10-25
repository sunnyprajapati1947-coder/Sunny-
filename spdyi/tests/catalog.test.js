import {test} from 'node:test';
import assert from 'node:assert/strict';
import {phones,brands,searchPhones} from '../src/catalog.js';
test('large catalog is deduplicated, names-only, with usable search aliases',()=>{
 assert.ok(phones.length>10000);assert.ok(brands.length>=50);
 const keys=new Set();for(const p of phones){assert.ok(p.brand&&p.model);assert.ok(Array.isArray(p.codes));assert.equal(p.ram,undefined);assert.equal(p.hz,undefined);const k=`${p.brand}:${p.model.toLowerCase()}`;assert.ok(!keys.has(k));keys.add(k);}
});
test('brand and model search is case-insensitive and supports model codes',()=>{
 const p=phones.find(p=>p.brand==='Samsung'&&p.codes.includes('SM-A145F'));assert.ok(p);
 assert.ok(searchPhones('Samsung','sm-a145f').includes(p));
 assert.ok(searchPhones('Redmi','note 13').length>0);assert.equal(searchPhones('Samsung','totallymissingphone123').length,0);
 assert.ok(searchPhones('Apple','iPhone 13').some(p=>p.model==='iPhone 13'));
});
test('major India brands are searchable',()=>{for(const b of ['Samsung','Vivo','Realme','OPPO','Redmi','POCO','iQOO','Apple','OnePlus','Infinix','Tecno','Itel','Lava','Motorola','Nothing'])assert.ok(brands.includes(b),b);});
