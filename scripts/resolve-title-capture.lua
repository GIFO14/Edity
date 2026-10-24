-- Captures the finished native title without modifying its effect parameters.
local p=resolve:GetProjectManager():GetCurrentProject()
assert(p:GetName()=='Untitled Project 33')
local t=p:GetCurrentTimeline()
local root='D:/Edity-media-verification/minecraft-week-2026-10-02/'
print('TITLE BACKUP',resolve:GetProjectManager():ExportProject(p:GetName(),root..'project-33-title-01.drp'))
print('TITLE TIMELINE',t:Export(root..'title-01.drt',resolve.EXPORT_DRT))
for _,frame in ipairs({0,1,2,3,4,6,15,30,55,59}) do
 local tc=string.format('00:00:%02d:%02d',math.floor(frame/30),frame%30)
 t:SetCurrentTimecode(tc)
 print('FRAME',frame,p:ExportCurrentFrameAsStill(root..string.format('resolve-title-01-%02d.png',frame)))
end
t:SetCurrentTimecode('00:00:00:15')
