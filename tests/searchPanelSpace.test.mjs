import {test} from 'node:test'
import assert from 'node:assert/strict'
import {searchPanelSpace} from '../src/useSearchPanelSpace.js'

test('search panel has usable bounded space at 300px and 240px visual heights',()=>{
  for(const height of [240,300]){
    const size=searchPanelSpace({formBottom:116,viewportHeight:height,controlsBottom:height-24})
    assert.ok(size>=80)
    assert.ok(116+4+size<=height-24)
  }
})
test('search panel respects a keyboard-reduced and shifted visual viewport',()=>{
  const size=searchPanelSpace({formBottom:316,viewportTop:200,viewportHeight:300,controlsBottom:700})
  assert.ok(size>0)
  assert.ok(316+4+size<=484)
})
test('search panel leaves room for manual placement and caps tall lists',()=>{
  assert.equal(searchPanelSpace({formBottom:140,viewportHeight:900,controlsBottom:836,manualTop:800}),480)
  assert.equal(searchPanelSpace({formBottom:140,viewportHeight:400,controlsBottom:336,manualTop:300}),148)
  assert.equal(searchPanelSpace({formBottom:300,viewportHeight:300}),0)
})
