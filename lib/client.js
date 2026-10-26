/* Pre-bundled Client entry for DSH Desktop v0.2.0-rc.2. */
window.__ModuleLoader__.load({id:'dsh-context-mask',factory:(require)=>{
var module={exports:{}}; var exports=module.exports;
'use strict'
const React=require('react')
const h=React.createElement
exports.inject=['commandUi','slots','remote','remote.commands']
const C={bg:'#202124',panel:'#292b30',border:'#43464e',text:'#eff1f5',muted:'#b2b9c2',blue:'#527be8',red:'#f2abab',green:'#a2e4be',warn:'#eac28c'}
const btn={background:C.panel,color:C.text,border:'1px solid '+C.border,borderRadius:8,padding:'8px 11px',fontSize:13,cursor:'pointer'}
const inputStyle={minWidth:0,background:C.panel,color:C.text,border:'1px solid '+C.border,borderRadius:8,padding:10,fontSize:13}
function bus(){let value={sessionId:null,open:false};const watchers=new Set();const notify=()=>{watchers.forEach(f=>f())};return{subscribe:f=>{watchers.add(f);return()=>watchers.delete(f)},getSnapshot:()=>value,open:id=>{value={sessionId:id,open:true};notify()},close:()=>{value={...value,open:false};notify()}}}
async function command(ctx,sessionId,line){
  const r=await ctx.remote.commands.execute(sessionId,line,[])
  if(!r?.ok)throw new Error(r?.error?.message??'Command RPC failed')
  if(!r.value)throw new Error('Context Mask Host command not installed')
  const body=r.value.result
  if(!body||!['error','success'].includes(body.kind))throw new Error('Unexpected Host response: expected value.result')
  if(body.kind==='error')throw new Error(body.text||'Command refused')
  return body.text||''
}
function rowType(type){return {'assistant/message':'Assistant','user/message':'User','tool/result':'Tool Result','system/message':'System','developer/message':'Developer'}[type]||type}
function counts(types){return [
  ['Assistant',types['assistant/message']||0],['User',types['user/message']||0],
  ['Tool Result',types['tool/result']||0],['Other',(types['developer/message']||0)+(types['system/message']||0)],
 ].map(([name,n])=>`${name}: ${n}`).join('  ·  ')}
const button=(title,onClick,extra={})=>h('button',{type:'button',style:{...btn,...extra.style},disabled:extra.disabled,onClick},title)
function Panel({ctx,bus:signal}){
  const open=React.useSyncExternalStore(signal.subscribe,signal.getSnapshot,signal.getSnapshot)
  const sessionId=open.sessionId
  const [mode,setMode]=React.useState('range')
  const [surfaceRows,setSurfaceRows]=React.useState([])
  const [assistantRows,setAssistantRows]=React.useState([])
  const [surfaceCount,setSurfaceCount]=React.useState(0)
  const [surfaceOmitted,setSurfaceOmitted]=React.useState(0)
  const [count,setCount]=React.useState(0)
  const [loading,setLoading]=React.useState(false)
  const [busy,setBusy]=React.useState(false)
  const [search,setSearch]=React.useState('')
  const [start,setStart]=React.useState('')
  const [end,setEnd]=React.useState('')
  const [selected,setSelected]=React.useState([])
  const [plan,setPlan]=React.useState(null)
  const [confirm,setConfirm]=React.useState(false)
  const [error,setError]=React.useState('')
  const [notice,setNotice]=React.useState('')
  const [expanded,setExpanded]=React.useState(null)
  const load=React.useCallback(async(reset=true)=>{
    if(!sessionId)return
    setLoading(true);setError('')
    if(reset){setPlan(null);setConfirm(false);setNotice('')}
    try{
      const text=await command(ctx,sessionId,'/mask_list')
      const d=JSON.parse(text)
      if(String(d.sessionId)!==String(sessionId))throw new Error('Wrong Session ID')
      setSurfaceRows(d.surfaceEntries||[]);setAssistantRows(d.entries||[])
      setSurfaceCount(d.surfaceCount??0);setSurfaceOmitted(d.surfaceOmitted??0);setCount(d.count??0)
    }catch(e){setError(String(e?.message??e))}
    finally{setLoading(false)}
  },[ctx,sessionId])
  React.useEffect(()=>{if(open.open)void load()},[open.open,load])
  if(!open.open)return null
  const invalidate=()=>{setPlan(null);setConfirm(false);setError('');setNotice('')}
  const choose=(which,seq)=>{if(busy)return;invalidate();if(which==='start')setStart(String(seq));else setEnd(String(seq))}
  const rangePreview=async()=>{
    if(busy)return
    setBusy(true);setError('');setNotice('');setConfirm(false);setPlan(null)
    try{const p=JSON.parse(await command(ctx,sessionId,`/mask_range_preview ${start.trim()} ${end.trim()}`));setPlan(p)}
    catch(e){setError(String(e?.message??e))}finally{setBusy(false)}
  }
  const rangeApply=async()=>{
    if(!plan||busy)return
    if(!confirm){setConfirm(true);return}
    setBusy(true);setError('');setNotice('')
    try{
      const response=await command(ctx,sessionId,`/mask_range_apply ${plan.startSeq} ${plan.endSeq} ${plan.token}`)
      setStart('');setEnd('');setPlan(null);setConfirm(false)
      await load(false);setNotice(response)
    }catch(e){setError(String(e?.message??e));setConfirm(false);setPlan(null)}
    finally{setBusy(false)}
  }
  const singleApply=async()=>{
    if(!selected.length||busy)return
    if(!confirm){setConfirm(true);return}
    setBusy(true);setError('');setNotice('')
    try{const answer=await command(ctx,sessionId,'/mask_apply '+selected.join(','));setSelected([]);setConfirm(false);await load(false);setNotice(answer)}
    catch(e){setError(String(e?.message??e));setConfirm(false)}finally{setBusy(false)}
  }
  const filter=search.toLowerCase().trim()
  const current=mode==='range'?surfaceRows:assistantRows
  const visible=current.slice().reverse().filter(r=>!filter||[r.seq,r.turn,r.step,r.type,r.preview].join(' ').toLowerCase().includes(filter))
  const indexBySeq=new Map(surfaceRows.map((r,i)=>[String(r.seq),i]))
  const a=indexBySeq.get(start.trim())??-1
  const b=indexBySeq.get(end.trim())??-1
  const close=()=>{if(!busy)signal.close()}
  const subline=(text)=>h('span',{style:{fontSize:11,color:C.muted}},text)
  return h('div',{role:'presentation',onMouseDown:e=>{if(e.target===e.currentTarget)close()},style:{position:'fixed',inset:0,zIndex:100000,display:'flex',justifyContent:'center',alignItems:'center',background:'rgba(0,0,0,.67)',padding:18}},
    h('section',{role:'dialog','aria-modal':'true','aria-label':'Context Mask',style:{width:'min(940px,98vw)',maxHeight:'92vh',overflow:'hidden',display:'flex',flexDirection:'column',borderRadius:14,background:C.bg,color:C.text,border:'1px solid '+C.border,fontFamily:'system-ui,sans-serif',boxShadow:'0 20px 65px rgba(0,0,0,.48)',fontSize:13}},
      h('header',{style:{padding:'15px 18px',display:'flex',alignItems:'center',justifyContent:'space-between',borderBottom:'1px solid '+C.border}},
        h('div',null,h('strong',{style:{fontSize:18}},'Context Mask'),h('div',{style:{fontSize:12,color:C.muted,marginTop:4}},'修改模型未来看到的历史；不修改原始轨迹或工程文件')),
        button('✕',close,{disabled:busy})),
      h('div',{style:{display:'flex',gap:10,padding:'12px 18px 3px'}},
        button('Range Mask · 区间',()=>{setMode('range');setConfirm(false);setError('');setNotice('')},{disabled:busy,style:mode==='range'?{background:C.blue,borderColor:C.blue}:{}}),
        button('Single Mask · 单条',()=>{setMode('single');setConfirm(false);setError('');setNotice('')},{disabled:busy,style:mode==='single'?{background:C.blue,borderColor:C.blue}:{}})),
      mode==='range'?h('div',{style:{display:'flex',flexWrap:'wrap',gap:10,padding:'12px 18px',alignItems:'end'}},
        h('label',{style:{display:'grid',gap:4,flex:'1 1 140px'}},subline('起点 Seq（包含）'),h('input',{style:inputStyle,value:start,placeholder:'点击消息设起点',onChange:e=>{setStart(e.target.value);invalidate()},disabled:busy})),
        h('label',{style:{display:'grid',gap:4,flex:'1 1 140px'}},subline('终点 Seq（包含）'),h('input',{style:inputStyle,value:end,placeholder:'点击消息设终点',onChange:e=>{setEnd(e.target.value);invalidate()},disabled:busy})),
        button(busy?'处理中…':'预览区间',()=>void rangePreview(),{disabled:busy||!start.trim()||!end.trim(),style:{borderColor:C.blue}}),
        button(loading?'加载中…':'刷新',()=>void load(),{disabled:busy||loading})):null,
      h('div',{style:{padding:'4px 18px 8px',display:'flex',gap:8,alignItems:'center'}},
        h('input',{style:{...inputStyle,flex:1},value:search,onChange:e=>setSearch(e.target.value),placeholder:'搜索 Seq / Turn / Step / 内容',disabled:busy}),
        subline(mode==='range'?`显示 ${surfaceRows.length} / ${surfaceCount} 条`: `Assistant ${count} 条`),
        mode==='single'?button('刷新',()=>void load(),{disabled:loading||busy}):null),
      mode==='range'&&surfaceOmitted>0?h('div',{style:{padding:'0 18px 8px',color:C.warn,fontSize:12}},`为避免界面卡顿，列表只显示最近 ${surfaceRows.length} 条；更早的消息仍可直接输入 Seq 作为区间端点。`):null,
      h('div',{style:{flex:'1 1 auto',overflowY:'auto',minHeight:115,padding:'5px 18px'}},
        visible.length===0?h('p',{style:{padding:15,color:C.muted,textAlign:'center'}},loading?'加载中…':'没有匹配的历史消息'):null,
        ...visible.map(row=>{
          if(mode==='range'){
            const i=indexBySeq.get(String(row.seq))??-1
            const inRange=a>=0&&b>=a&&i>=a&&i<=b
            const isStart=start===String(row.seq),isEnd=end===String(row.seq)
            return h('div',{key:row.seq,style:{background:inRange?'#2d3950':C.panel,border:'1px solid '+(isStart||isEnd?C.blue:C.border),borderRadius:9,padding:'10px 11px',marginBottom:6,display:'flex',gap:12,alignItems:'center'}},
              h('div',{style:{flex:1,minWidth:0}},
                h('div',{style:{display:'flex',justifyContent:'space-between',flexWrap:'wrap',gap:7}},
                  h('strong',null,`${rowType(row.type)}${row.turn!==null&&row.turn!==undefined?' · 第 '+row.turn+' 轮':''}${row.step!==null&&row.step!==undefined?' · 第 '+row.step+' 步':''}`),
                  subline(`Seq ${row.seq}${row.toolCalls?' · '+row.toolCalls+' tool call(s)':''}`)),
                h('div',{style:{fontSize:12,color:C.muted,marginTop:5,overflow:'hidden',whiteSpace:expanded===row.seq?'pre-wrap':'nowrap',textOverflow:'ellipsis',overflowWrap:'anywhere'}},row.preview)),
              h('div',{style:{display:'flex',gap:5,flexShrink:0}},
                button(isStart?'● 起点':'设起点',()=>choose('start',row.seq),{disabled:busy||row.protected,style:isStart?{borderColor:C.blue,color:'#b7d0ff',padding:'6px'}:{padding:'6px'}}),
                button(isEnd?'● 终点':'设终点',()=>choose('end',row.seq),{disabled:busy||row.protected,style:isEnd?{borderColor:C.blue,color:'#b7d0ff',padding:'6px'}:{padding:'6px'}})))
          }
          return h('label',{key:row.seq,style:{display:'flex',gap:12,background:C.panel,marginBottom:6,border:'1px solid '+C.border,borderRadius:9,padding:'11px',opacity:row.maskable?1:.65,cursor:row.maskable?'pointer':'not-allowed'}},
            h('input',{type:'checkbox',checked:selected.includes(row.seq),disabled:busy||!row.maskable,onChange:()=>{setSelected(s=>s.includes(row.seq)?s.filter(x=>x!==row.seq):[...s,row.seq]);setConfirm(false)},style:{accentColor:C.blue}}),
            h('div',{style:{minWidth:0,flex:1}},h('strong',null,`Assistant · 第 ${row.turn} 轮 · 第 ${row.step} 步 · Seq ${row.seq}`),
              h('div',{style:{fontSize:12,color:C.muted,marginTop:6,overflow:'hidden',whiteSpace:expanded===row.seq?'pre-wrap':'nowrap',textOverflow:'ellipsis'}},row.preview||'(empty)'),
              !row.maskable?h('div',{style:{fontSize:11,color:C.red,marginTop:4}},row.reason):null,
              button(expanded===row.seq?'收起':'展开',e=>{e.preventDefault();setExpanded(expanded===row.seq?null:row.seq)},{style:{fontSize:11,padding:'3px 6px',marginTop:6}})))
        })),
      mode==='range'&&plan?h('div',{style:{margin:'7px 18px 8px',background:'#28352e',border:'1px solid #438063',borderRadius:9,padding:12}},
        h('strong',null,`预览：将隔离 ${plan.total} 条模型可见消息`),
        h('div',{style:{marginTop:5,color:C.text,fontSize:12}},counts(plan.types||{})),
        h('div',{style:{marginTop:5,color:C.muted,fontSize:12}},`起点：${plan.first?.role} Seq ${plan.startSeq} · ${plan.first?.preview||'(empty)'}`),
        h('div',{style:{marginTop:5,color:C.muted,fontSize:12}},`终点：${plan.last?.role} Seq ${plan.endSeq} · ${plan.last?.preview||'(empty)'}`),
        h('div',{style:{marginTop:5,color:C.muted,fontSize:12}},`其中包含 ${plan.toolCalls} 次工具调用；实际执行产物不会被删除。`),
        search.trim()?h('div',{style:{marginTop:5,color:C.warn,fontSize:12}},'注意：搜索只筛选列表展示，不会缩小实际 Mask 区间。'):null,
        ...(plan.warnings||[]).map((x,i)=>h('div',{key:i,style:{marginTop:6,color:C.warn,fontSize:12}},'注意：'+x)),
        h('div',{style:{marginTop:7,fontSize:12,color:C.warn}},'原始 Event Log 保留；此操作没有一键 Undo。请核对起止 Seq。')):null,
      error?h('div',{role:'alert',style:{color:C.red,padding:'7px 18px',whiteSpace:'pre-wrap'}},error):null,
      notice?h('div',{role:'status',style:{color:C.green,padding:'7px 18px',whiteSpace:'pre-wrap'}},notice):null,
      confirm?h('div',{style:{margin:'6px 18px',padding:10,color:C.warn,border:'1px solid #aa7a41',borderRadius:8}},
        mode==='range'?`最后确认：隐藏 Seq ${plan?.startSeq} 到 ${plan?.endSeq}，共 ${plan?.total} 条模型历史。包括其中的 User 提问及 Tool Result。操作不会删除真实文件。`:`最后确认：隐藏选中的 ${selected.length} 条 Assistant 消息。`):null,
      h('footer',{style:{borderTop:'1px solid '+C.border,padding:'13px 18px',display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}},
        h('span',{style:{fontSize:12,color:C.muted}},mode==='range'?(plan?`范围：Seq ${plan.startSeq} → ${plan.endSeq}`:'请选择起点、终点，再预览'): `已选择 ${selected.length} 条（最多 20）`),
        h('div',{style:{display:'flex',gap:8}},button('取消',close,{disabled:busy}),
          mode==='range'?button(busy?'处理中…':confirm?'最终确认 Apply':'Apply Range',()=>void rangeApply(),{disabled:busy||!plan,style:{background:C.blue,borderColor:C.blue,opacity:plan?1:.6}})
          :button(busy?'处理中…':confirm?'最终确认 Apply':'Apply Single',()=>void singleApply(),{disabled:busy||selected.length===0||selected.length>20,style:{background:C.blue,borderColor:C.blue,opacity:selected.length?1:.6}}))))
    )
}
exports.apply=function apply(ctx){
  const signal=bus()
  ctx.effect(()=>ctx.commandUi.register({
    name:'mask',label:()=> 'Context Mask',description:()=> 'Range Mask：隔离连续历史区间',
    available:()=>true,ui:{kind:'action',run:session=>signal.open(session.sessionId)},
  }),'context-mask: slash command')
  ctx.slots.inject('shell.overlay',()=>ctx.slots.register({name:'shell.overlay',id:'context-mask'},()=>h(Panel,{ctx,bus:signal})))
}
return module.exports;
}});
