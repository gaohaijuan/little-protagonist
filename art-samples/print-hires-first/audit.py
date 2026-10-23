"""Audit source sampling at the largest requested print camera; no asset resizing."""
import json
import math
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'art-samples/print-hires-first'
OUT.mkdir(parents=True, exist_ok=True)
PANEL_MM = 128.5
AREA_ASPECT = 910 / 788
pages = []
assets = []

def add_page(book, page, scene, crop, full_scene=False):
    # Legacy renderers widen/heighten the camera to the 65% illustration area.
    # Hair can only expand that camera, so no-hair is the greatest enlargement.
    vw = max(crop['width'], crop['height'] * AREA_ASPECT)
    vh = max(crop['height'], crop['width'] / AREA_ASPECT)
    ppi = vw / PANEL_MM * 25.4
    pages.append(dict(book=book, page=page, scene=scene, sourceCrop=crop,
                      expandedCamera=dict(width=vw, height=vh),
                      effectivePpiAtMaximumPanel=round(ppi, 2),
                      passes300ppi=ppi >= 300,
                      requiredNativeResolutionMultiplier=round(300/ppi, 4),
                      requiredFullSourceDimensionsAt300ppi=[math.ceil(1672*300/ppi),math.ceil(941*300/ppi)],
                      requiredFullSourceDimensionsRoundedTo16=[math.ceil(1672*300/ppi/16)*16,math.ceil(941*300/ppi/16)*16],
                      minimumIndependentCameraPixels=[math.ceil(vw*300/ppi),math.ceil(vh*300/ppi)],
                      maximumPanelWidthMmAt300ppi=round(vw / 300 * 25.4, 2)))

intro = json.loads((ROOT / 'preview/art/intro/manifest.json').read_text())
for k, c in intro['crops'].items():
    add_page('intro', int(k)+1, ['greeting','play','greeting','play','school','school'][int(k)], c)
hands = json.loads((ROOT / 'preview/art/sequence/hands/manifest.json').read_text())
for i, e in enumerate(hands['pages']):
    add_page('hands', i+1, e['scene'], e['crop'])
flower = json.loads((ROOT / 'preview/art/flower/manifest.json').read_text())
for i, scene in enumerate(['care','care','wind','wind','wind','search']):
    c = flower['closeup'] if i == 1 else dict(x=0,y=0,width=1672*.65,height=941)
    add_page('flower', i+1, scene, c)

for book, source, served, names in [
    ('intro', 'art-samples/my-introduction-production', 'preview/art/intro', ['greeting','play','school']),
    ('flower', 'art-samples/my-flower-production', 'preview/art/flower', ['care','wind','search']),
    ('hands', 'art-samples/books-04-06/hands', 'preview/art/sequence/hands', ['hands-show','hands-open','hands-closed']),
]:
    for name in names:
        scene = name.removeprefix('hands-')
        old = f'{served}/{name}.webp'
        relevant = [p for p in pages if p['book']==book and p['scene']==scene]
        assets.append(dict(oldResourcePath=old, originalSourcePath=f'{source}/{name}.png',
                           originalDimensions=list(Image.open(ROOT/source/f'{name}.png').size),
                           newFilePath=None, newDimensions=None, status='unresolved',
                           passes300ppi=False,
                           worstEffectivePpi=min(p['effectivePpiAtMaximumPanel'] for p in relevant),
                           reason='No native higher resolution source found; built-in image generator returned approximately 1.57 megapixels despite explicit larger output request. No interpolated substitute accepted.'))

rejected = [
    dict(oldResourcePath='preview/art/intro/greeting.webp',
         candidatePath='art-samples/print-hires-first/intro/greeting-generated-1672-rejected.png',
         requestedDimensions=[3840,2160], actualDimensions=[1672,941],
         generationSource='built-in image_gen edit from art-samples/my-introduction-production/greeting.png',
         status='rejected', passes300ppi=False,
         reason='Actual output has the same pixel dimensions as the original. Geometry was visually similar but this does not improve source sampling.'),
    dict(oldResourcePath='preview/art/flower/care.webp',
         candidatePath='art-samples/print-hires-first/flower/care-closeup-generated.png',
         requestedDimensions=[2304,2000], actualDimensions=[1345,1169],
         generationSource='built-in image_gen edit, independent close-up of original crop (520,446,520,451)',
         proposedCropMapping=dict(x=0,y=0,width=1345,height=1169),
         effectivePpiAtMaximumPanel=round(min(1345/128.5,1169/(128.5/AREA_ASPECT))*25.4,2),
         maximumWidthMmAt300ppi=round(1345/300*25.4,2),
         status='rejected', passes300ppi=False,
         reason='Under 300ppi at maximum panel. Flower center, hands, knee, shoe and leaf move relative to original crop; collar enters top edge. Mapping is diagnostic only and must not be connected.'),
]
manifest = dict(version=1, status='no-approved-replacements', approvedAssets=[], assets=assets,
                printAssumptions=dict(illustrationPanelWidthMm=PANEL_MM,
                                      illustrationPanelHeightMm=PANEL_MM/AREA_ASPECT,
                                      legacyCanvas=[1400,788], leftIllustrationFraction=.65,
                                      safePanelXmm=[8,136.5],
                                      note='Camera expansion for user hair decreases enlargement. These measurements apply to the greatest no-extra-hair camera enlargement. Cover layouts require their actual output camera to be evaluated separately.'),
                pageAudit=pages, rejectedCandidates=rejected,
                qaFiles=['art-samples/print-hires-first/originals-qa-contact.png',
                         'art-samples/print-hires-first/flower/closeup-qa-comparison.png'],
                restrictions=['No real portrait input was sent to ImageGen.',
                              'No original source or existing manifest was changed.',
                              'No candidate was copied into serving asset directories.',
                              'No interpolation or DPI metadata alteration was used to claim source detail.'])
(OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(dict(approved=0,sourceAssets=len(assets),pages=len(pages),
                     rejected=len(rejected)),ensure_ascii=False))
