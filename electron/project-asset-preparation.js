const fs = require('node:fs');
const path = require('node:path');

function prepareProjectAssets(coordinator, repository, document) {
  if (!coordinator.handlers.has('asset') || document.processing && document.processing.status !== 'done') return;
  const directory = repository.directory(document.id);
  for (const asset of Object.values(document.composition.assets)) {
    if (asset.kind === 'font' || asset.status === 'missing') continue;
    const needsPreparation = asset.status === 'failed' || !asset.hash ||
      asset.kind === 'video' && !asset.width ||
      asset.color?.profile && !asset.normalizedPath ||
      [asset.normalizedPath, asset.previewPath].some(file => file && !fs.existsSync(path.resolve(directory, file)));
    if (!needsPreparation) continue;
    let job = coordinator.start({kind:'asset',projectId:document.id,payload:{assetId:asset.id},
      requestId:`prepare-existing-${asset.id}-${document.transcriptRevision || 0}`});
    // Reopening retries a failed preparation. Active work is still deduplicated,
    // and another failure stays terminal until the next explicit project open.
    if (job.status === 'complete') job = coordinator.start({kind:'asset',projectId:document.id,
      payload:{assetId:asset.id},requestId:`prepare-existing-${asset.id}-revision-${document.revision}`});
    if (['failed','cancelled','interrupted'].includes(job.status)) coordinator.retry(job.id);
  }
}
module.exports = {prepareProjectAssets};
