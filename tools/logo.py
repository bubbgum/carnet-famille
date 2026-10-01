from PIL import Image, ImageFilter, ImageChops, ImageDraw
import numpy as np
src=Image.open('/root/.claude/uploads/1579e5c7-a1ed-52c0-b084-e861403ea067/be462c55-image.jpg').convert('RGB')
cr=src.crop((640,780,900,1200))
a=np.asarray(cr).astype(float); r,g,b=a[...,0],a[...,1],a[...,2]
L=0.299*r+0.587*g+0.114*b
bgc=np.array([224,203,186]); d=np.sqrt(((a-bgc)**2).sum(-1))
m=Image.fromarray(((d>20)*255).astype('uint8')).filter(ImageFilter.MedianFilter(3))
m=m.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MinFilter(3))  # fermeture : bouche les trous de la texture
bbox=m.getbbox(); m=m.crop(bbox); Lc=Image.fromarray(L.astype('uint8')).crop(bbox)
# upscale
S=4; W,H=m.size; m=m.resize((W*S,H*S),Image.LANCZOS).filter(ImageFilter.GaussianBlur(1.2)).point(lambda v:255 if v>128 else 0).filter(ImageFilter.GaussianBlur(.8))
Lc=Lc.resize((W*S,H*S),Image.LANCZOS)
W,H=m.size
# recoloration : texture sombre -> clair éclatant, texture claire -> lavande
t=np.asarray(Lc).astype(float)/255.0       # 0 sombre .. 1 clair
yy=np.linspace(0,1,H)[:,None]*np.ones((1,W))
dark_top=np.array([96,128,255]); dark_bot=np.array([150,104,255])   # rayures : bleu -> violet
light_top=np.array([236,246,255]); light_bot=np.array([240,228,255])  # fond clair : blanc bleuté -> lavande
dk=dark_top*(1-yy[...,None])+dark_bot*yy[...,None]
lt=light_top*(1-yy[...,None])+light_bot*yy[...,None]
k=np.clip((t-0.18)/0.55,0,1)[...,None]
col=dk*(1-k)+lt*k
rgba=np.dstack([col.clip(0,255),np.asarray(m)]).astype('uint8')
letterimg=Image.fromarray(rgba,'RGBA')
letterimg.save('letter.png')
def icon(size, scale=0.66, mask_round=False):
    N=1024
    bg=Image.new('RGB',(N,N))
    x=np.linspace(0,1,N)[None,:]; y=np.linspace(0,1,N)[:,None]
    d=(x+y)/2
    c1=np.array([30,52,170]); c2=np.array([70,34,160])
    arr=c1*(1-d[...,None])+c2*d[...,None]
    def glow(cx,cy,rad,colr,strength):
        dist=np.sqrt((x-cx)**2+(y-cy)**2); w=np.clip(1-dist/rad,0,1)**2*strength
        return w[...,None]*(np.array(colr)-arr)
    arr=arr+glow(.2,.15,.7,[70,140,255],.55)+glow(.9,.95,.7,[150,90,255],.45)
    bg=Image.fromarray(arr.clip(0,255).astype('uint8'))
    # reflet verre en haut
    hl=Image.new('L',(N,N),0); dr=ImageDraw.Draw(hl); dr.ellipse((-300,-700,N+300,420),fill=60); hl=hl.filter(ImageFilter.GaussianBlur(60))
    bg.paste((255,255,255),(0,0),hl)
    L=letterimg; lh=int(N*scale); lw=int(L.width*lh/L.height); L=L.resize((lw,lh),Image.LANCZOS)
    px=(N-lw)//2; py=(N-lh)//2
    sh=Image.new('L',(N,N),0); sh.paste(L.split()[3],(px+10,py+22)); sh=sh.filter(ImageFilter.GaussianBlur(24))
    bg.paste((10,10,60),(0,0),sh.point(lambda v:int(v*.7)))
    bg.paste(L,(px,py),L)
    return bg.resize((size,size),Image.LANCZOS)
import os; os.makedirs('out',exist_ok=True)
icon(512).save('out/icon-512.png'); icon(192).save('out/icon-192.png'); icon(180).save('out/apple-touch-icon.png'); icon(512,0.52).save('out/icon-maskable-512.png')
# logo pour l'en-tête : lettre seule, 160 px de haut
lh=160; lw=int(letterimg.width*lh/letterimg.height); letterimg.resize((lw,lh),Image.LANCZOS).save('out/logo-s.png',optimize=True)
icon(512).save('preview.png')
print(letterimg.size, lw)
