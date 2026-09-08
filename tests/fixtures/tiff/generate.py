from pathlib import Path
import numpy as np, tifffile as t, imagecodecs
out=Path(__file__).parent
y,x=np.mgrid[:17,:19]
rgb=np.stack([x*3000+123,y*3500+45,(x+y)*1700+67],-1).astype(np.uint16)
for name,kw in [('rgb16-le.tif',dict(byteorder='<',rowsperstrip=5)),('rgb16-lzw-be.tif',dict(byteorder='>',compression='lzw',predictor=2,rowsperstrip=5)),('rgb16-planar.tif',dict(planarconfig='separate',compression='deflate',predictor=2,tile=(16,16))),('rgb8-packbits.tif',dict(compression='packbits',rowsperstrip=5))]:
 a=rgb.transpose(2,0,1) if 'planarconfig' in kw else rgb
 if 'rgb8' in name:a=(a>>8).astype('uint8')
 t.imwrite(out/name,a,photometric='rgb',metadata=None,**kw)
prim=[(.64,.33),(.30,.60),(.15,.06)]
def rationals(vals):return tuple(n for v in vals for n in (round(v*100000),100000))
tags=[(319,'2I',6,rationals([v for xy in prim for v in xy]),False),(318,'2I',2,rationals([.3127,.3290]),False)]
hdr=np.array([-.125,0,.18,.5,1,2,4],dtype='float32')[None,:,None]*np.ones((3,1,3),dtype='float32')
for endian in ['<','>']:
 t.imwrite(out/('hdr-'+('le' if endian=='<' else 'be')+'.tif'),hdr,photometric='rgb',compression='deflate',predictor=3,byteorder=endian,rowsperstrip=2,metadata=None,extratags=tags)
# Own minimal matrix/TRC ICC profile; all values below are standard color-space data.
import struct

def icc(gray=False):
 def xyz(v):return b'XYZ '+bytes(4)+b''.join(struct.pack('>i',round(x*65536)) for x in v)
 def curve(g):return b'curv'+bytes(4)+struct.pack('>IH',1,round(g*256))+bytes(2)
 tags={b'wtpt':xyz([.96422,1,.82521])}
 if gray:tags[b'kTRC']=curve(1)
 else:
  for name,values in [(b'rXYZ',[.4360747,.2225045,.0139322]),(b'gXYZ',[.3850649,.7168786,.0971045]),(b'bXYZ',[.1430804,.0606169,.7141733])]:tags[name]=xyz(values)
  for name in [b'rTRC',b'gTRC',b'bTRC']:
   tags[name]=b'para'+bytes(4)+struct.pack('>H',4)+bytes(2)+b''.join(struct.pack('>i',round(x*65536)) for x in [2.4,1/1.055,.055/1.055,1/12.92,.04045,0,0])
 header=bytearray(128);header[8:12]=bytes([4,0x30,0,0]);header[12:16]=b'mntr';header[16:20]=b'GRAY' if gray else b'RGB ';header[20:24]=b'XYZ ';header[36:40]=b'acsp';header[68:80]=xyz([.96422,1,.82521])[8:]
 table=bytearray(struct.pack('>I',len(tags)));data=bytearray();start=132+12*len(tags)
 for name,content in tags.items():
  table+=name+struct.pack('>II',start+len(data),len(content));data+=content
 struct.pack_into('>I',header,0,len(header)+len(table)+len(data))
 return bytes(header+table+data)

t.imwrite(out/'rgb16-icc.tif',rgb,photometric='rgb',iccprofile=icc(),metadata=None)
t.imwrite(out/'gray16-icc.tif',np.full((5,7),16384,dtype='uint16'),photometric='minisblack',iccprofile=icc(True),metadata=None)
for orientation in range(2,9):
 t.imwrite(out/f'orientation-{orientation}.tif',rgb,photometric='rgb',metadata=None,extratags=[(274,'H',1,orientation,False)])
rgba=np.empty((5,7,4),dtype='uint16');rgba[:,:,:3]=[8192,16384,24576];rgba[:,:,3]=32768
t.imwrite(out/'associated-alpha.tif',rgba,photometric='rgb',extrasamples='assocalpha',metadata=None)
t.imwrite(out/'half.tif',hdr.astype('float16'),photometric='rgb',compression='deflate',predictor=3,metadata=None,extratags=tags)
for bits,values in [(16,[32768,32800]),(32,[2**31,2**31+2**21])]:
 t.imwrite(out/f'precision{bits}.tif',np.array([values],dtype=f'uint{bits}'),photometric='minisblack',iccprofile=icc(True),metadata=None)
for value,name in [(float('nan'),'nonfinite'),(1e6,'overflow')]:
 t.imwrite(out/f'{name}.tif',np.full((2,2,3),value,dtype='float32'),photometric='rgb',metadata=None,extratags=tags)

import json
# Compact expected samples in linear Rec.2020, independent of the WGSL implementation.
M=np.array([[.627404,.329283,.043313],[.069097,.91954,.011362],[.016391,.088013,.895595]])
def linear_rgb(values):return np.where(values<=.04045,values/12.92,((values+.055)/1.055)**2.4)@M.T
reference=[]
def record(name,image,points=None,alpha=1,tolerance=.0007):
 h,w=image.shape[:2];points=points or [(0,0),(w//2,h//2),(w-1,h-1)]
 reference.append({'name':name,'size':[w,h],'tolerance':tolerance,'points':[{'x':x,'y':y,'rgba':image[y,x].tolist()+[alpha]} for x,y in points]})
for name in ['rgb16-le.tif','rgb16-lzw-be.tif','rgb16-planar.tif','rgb16-icc.tif']:
 record(name,linear_rgb(rgb/65535),[(0,0),(1,3),(18,16),(16,15)])
record('rgb8-packbits.tif',linear_rgb((rgb>>8)/255))
for name in ['hdr-le.tif','hdr-be.tif','half.tif']:record(name,hdr,[(x,1) for x in range(7)],tolerance=.004)
record('gray16-icc.tif',np.ones((5,7,3))*16384/65535)
record('associated-alpha.tif',linear_rgb(np.ones((5,7,3))*[.25,.5,.75]),alpha=32768/65535)
for orientation in range(2,9):
 encoded=[rgb,np.fliplr(rgb),np.flip(rgb,(0,1)),np.flipud(rgb),rgb.transpose(1,0,2),np.rot90(rgb,-1),np.flip(rgb.transpose(1,0,2),(0,1)),np.rot90(rgb,1)][orientation-1]
 record(f'orientation-{orientation}.tif',linear_rgb(encoded/65535))
for bits,values in [(16,[32768,32800]),(32,[2**31,2**31+2**21])]:
 record(f'precision{bits}.tif',(np.array(values)/(2**bits-1))[None,:,None]*np.ones(3),tolerance=.00049)


(out/'reference.json').write_text(json.dumps(reference,indent=2)+'\n')
