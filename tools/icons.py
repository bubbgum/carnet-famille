from PIL import Image, ImageDraw, ImageFilter
import random
S=1024
def make(scale=1.0):
    im=Image.new('RGB',(S,S))
    px=im.load()
    for y in range(S):
        for x in range(S):
            t=(x*0.4+y*0.6)/S
            r=int(38*(1-t)+14*t); g=int(84*(1-t)+22*t); b=int(62*(1-t)+18*t)
            px[x,y]=(r,g,b)
    random.seed(3)
    noise=Image.effect_noise((S,S),22).convert('L')
    im=Image.blend(im,Image.merge('RGB',(noise,noise,noise)),0.06)
    d=ImageDraw.Draw(im)
    c=S/2; w=560*scale; h=520*scale
    x0,y0,x1,y1=c-w/2,c-h/2+30*scale,c+w/2,c+h/2+30*scale
    brass=(214,168,96); dark=(18,26,22)
    # ombre
    sh=Image.new('L',(S,S),0); ImageDraw.Draw(sh).rounded_rectangle((x0+10,y0+24,x1+10,y1+24),radius=int(70*scale),fill=150)
    sh=sh.filter(ImageFilter.GaussianBlur(28)); im.paste((5,10,8),(0,0),sh); d=ImageDraw.Draw(im)
    d.rounded_rectangle((x0,y0,x1,y1),radius=int(70*scale),fill=(28,40,34),outline=brass,width=int(26*scale))
    d.rectangle((x0+13*scale,y0+110*scale,x1-13*scale,y0+136*scale),fill=brass)
    for rx in (c-150*scale,c+150*scale):
        d.rounded_rectangle((rx-22*scale,y0-70*scale,rx+22*scale,y0+60*scale),radius=int(22*scale),fill=(230,236,232),outline=dark,width=int(8*scale))
    cols=[(220,115,95),(127,168,204),(216,166,78),(87,194,170)]
    gx=c; gy=(y0+136*scale+y1)/2+6*scale; sp=112*scale; r=62*scale
    for i,col in enumerate(cols):
        cx=gx+(-sp/2 if i%2==0 else sp/2)*1.55; cy=gy+(-sp/2 if i<2 else sp/2)*1.25
        d.regular_polygon((cx,cy,r),4,rotation=45,fill=col)
    return im
make(1.0).resize((512,512),Image.LANCZOS).save('icons/icon-512.png')
make(1.0).resize((192,192),Image.LANCZOS).save('icons/icon-192.png')
make(1.0).resize((180,180),Image.LANCZOS).save('icons/apple-touch-icon.png')
make(0.78).resize((512,512),Image.LANCZOS).save('icons/icon-maskable-512.png')
