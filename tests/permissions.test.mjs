import {test} from 'node:test';
import assert from 'node:assert/strict';
import {permitted,modules,actions} from '../lib/modules.ts';
test('readonly role never grants writes, download or export by default',()=>{
 for(const module of Object.keys(modules))for(const action of ['create','edit','delete','download','export'])assert.equal(permitted({role:'viewer'},module,action),false);
});
test('explicit denials override agent defaults and grants can be scoped to a module',()=>{
 const m={role:'agent',permissions:{policies:{edit:false},claims:{export:true}}};
 assert.equal(permitted(m,'policies','edit'),false);
 assert.equal(permitted(m,'claims','edit'),true);
 assert.equal(permitted(m,'claims','export'),true);
 assert.equal(permitted(m,'clients','export'),false);
});
test('non-admin cannot grant themselves settings, backup, audit or user administration',()=>{
 for(const role of ['viewer','agent','operations'])for(const module of ['settings','categories','users','audit','backup'])for(const action of actions)assert.equal(permitted({role,permissions:{[module]:{[action]:true}}},module,action),false);
});
test('agency administrator retains full administrative access',()=>{
 for(const module of [...Object.keys(modules),'users','audit','backup'])for(const action of actions)assert.equal(permitted({role:'admin'},module,action),true);
});
