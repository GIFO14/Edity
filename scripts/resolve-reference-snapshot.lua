-- Read-only inventory of the user's reference project, plus recoverable exports.
local r=resolve or fusion:GetResolve()
assert(r, 'No internal Resolve API')
local p=r:GetProjectManager():GetCurrentProject()
assert(p:GetName()=='Untitled Project 30', 'Reference project must be active')
local t=p:GetCurrentTimeline()
local root='D:/Edity-media-verification/minecraft-week-2026-10-02/'
local function json(v,seen)
 local ty=type(v)
 if ty=='nil' then return 'null' elseif ty=='boolean' or ty=='number' then return tostring(v) elseif ty~='table' then return '"'..tostring(v):gsub('\\','\\\\'):gsub('"','\\"'):gsub('\n','\\n'):gsub('\r','\\r'):gsub('\t','\\t')..'"' end
 seen=seen or {};if seen[v] then return 'null' end;seen[v]=true
 local parts={};for k,x in pairs(v) do parts[#parts+1]=json(tostring(k))..':'..json(x,seen) end;seen[v]=nil;return '{'..table.concat(parts,',')..'}'
end
local data={project=p:GetName(),timeline=t:GetName(),start=t:GetStartFrame(),finish=t:GetEndFrame(),settings=t:GetSetting(),tracks={}}
for _,kind in ipairs({'video','audio'}) do
 data.tracks[kind]={}
 for track=1,t:GetTrackCount(kind) do
  local items={};for i,c in ipairs(t:GetItemListInTrack(kind,track) or {}) do
   local source=c:GetMediaPoolItem()
   local item={name=c:GetName(),start=c:GetStart(),finish=c:GetEnd(),duration=c:GetDuration(),left=c:GetLeftOffset(),right=c:GetRightOffset(),properties=c:GetProperty(),source=source and source:GetClipProperty() or {},fusionCount=c:GetFusionCompCount()}
   items[tostring(i)]=item
  end
  data.tracks[kind][tostring(track)]={name=t:GetTrackName(kind,track),items=items}
 end
end
local f=assert(io.open(root..'reference-30.json','w'));f:write(json(data));f:close()
print('REFERENCE INVENTORY',p:GetName(),t:GetName())
print('REFERENCE TIMELINE',t:Export(root..'reference-30.drt',r.EXPORT_DRT))
print('REFERENCE FCPXML',t:Export(root..'reference-30.fcpxml',r.EXPORT_FCPXML_1_10))
print('PROJECT 33 BACKUP',r:GetProjectManager():ExportProject('Untitled Project 33',root..'project-33-before-media.drp'))
