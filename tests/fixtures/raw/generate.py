from pathlib import Path
import numpy as np, tifffile, imagecodecs, json
root=Path(__file__).parent;root.mkdir(exist_ok=True)
xyz=np.array([[.4124564,.3575761,.1804375],[.2126729,.7151522,.0721750],[.0193339,.1191920,.9503041]])
rgb2020=np.array([[.627404,.329283,.043313],[.069097,.91954,.011362],[.016391,.088013,.895595]])
def rats(vals):return tuple(n for v in vals for n in (round(v*10000000),10000000))
tags=[(254,'I',1,0,False),(50706,'B',4,(1,7,1,0),False),(50707,'B',4,(1,7,1,0),False),(50721,'2i',9,rats(np.linalg.inv(xyz).flatten()),False),(50728,'2I',3,rats([1,1,1]),False),(50717,'I',1,65535,False),(50778,'H',1,21,False),(274,'H',1,6,False),(50708,'s',0,'OpenLight Synthetic Camera',False)]
raw=np.tile(np.array([[32768,16384],[16384,8192]],dtype='uint16'),(48,64))
tifffile.imwrite(root/'bayer.dng',raw,photometric=32803,rowsperstrip=96,metadata=None,extratags=tags+[(33421,'H',2,(2,2),False),(33422,'B',4,(0,1,1,2),False)])
rgb=np.zeros((96,128,3),dtype=np.uint16)+[32768,16384,8192]
rgb=rgb.astype('uint16')
encoded=imagecodecs.jpegxl_encode(rgb,lossless=True)
tifffile.imwrite(root/'linear-jxl.dng',iter([encoded]),shape=rgb.shape,dtype=rgb.dtype,photometric=2,rowsperstrip=96,compression=52546,metadata=None,extratags=tags)
with tifffile.TiffFile(root/'linear-jxl.dng') as file: offset=file.pages[0].tags[262].valueoffset
with (root/'linear-jxl.dng').open('r+b') as file:
 file.seek(offset);file.write((34892).to_bytes(2,'little'))
expected=rgb2020@np.array([32768,16384,8192])/65535
(root/'reference.json').write_text(json.dumps({'width':96,'height':128,'expectedRgb':expected.tolist()},indent=2))
