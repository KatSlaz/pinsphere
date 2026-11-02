import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
function luminance(hex){const c=hex.match(/\w\w/g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722}
test('auth and collaboration primary backgrounds meet 4.5:1 with white in all active states',()=>{
  for(const [file,selector] of [['AuthForm.css','auth-submit'],['Collaboration.css','collaboration-primary']]){
    const css=readFileSync(new URL(`../src/components/${file}`,import.meta.url),'utf8')
    const rules=[...css.matchAll(new RegExp(`\\.${selector}[^{}]*\\{([^}]+)\\}`,'g'))].map(m=>m[1]).join(' ')
    const colors=[...rules.matchAll(/#[\da-f]{6}/gi)].map(m=>m[0].slice(1))
    assert.ok(colors.length>=3)
    for(const color of colors)assert.ok(1.05/(luminance(color)+.05)>=4.5,`${file}: #${color}`)
  }
})
