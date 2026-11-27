import math, sys, json
P = dict(purple="#6B2CF5", lime="#BDF72B", pupil="#23123E", white="#FFFFFF")
X0, X1, Y0, Y1, R = 212, 812, 340, 830, 112
ROT = "translate(13 -58) rotate(-10 512 560)"
# beak divider: from right edge A down-left to bottom edge B, bulging toward the body centre
A = (X1, 704); B = (694, Y1)
CURVE = f"C 764 698, 702 736, {B[0]} {B[1]}"
def body_path():
    return (f"M {X0+R} {Y0} L {X1-R} {Y0} A {R} {R} 0 0 1 {X1} {Y0+R} L {A[0]} {A[1]} {CURVE} "
            f"L {X0+R} {Y1} A {R} {R} 0 0 1 {X0} {Y1-R} L {X0} {Y0+R} A {R} {R} 0 0 1 {X0+R} {Y0} Z")
def beak_path():
    return (f"M {A[0]} {A[1]} {CURVE} L {X1-R} {Y1} A {R} {R} 0 0 0 {X1} {Y1-R} Z")
TUFTS = [
  "M 486 372 L 478 344 C 430 276 352 214 296 214 C 238 214 218 276 252 318 L 262 372 Z",
  "M 300 400 C 268 352 232 330 196 336 C 142 346 138 432 196 452 C 214 458 232 458 250 452 L 300 452 Z",
]
LID = 548
def eye(cx, rx, ry, d, prx, pry, pdx, pdy):
    # white: ellipse centred d above the lid, cut flat at the lid line
    hw = rx*math.sqrt(1-(d/ry)**2)
    white = f"M {cx-hw:.1f} {LID} A {rx} {ry} 0 1 0 {cx+hw:.1f} {LID} Z"
    pcx, pcy = cx+pdx, LID+pdy
    ph = prx*math.sqrt(1-(pdy/pry)**2)
    pupil = f"M {pcx-ph:.1f} {LID} A {prx} {pry} 0 1 0 {pcx+ph:.1f} {LID} Z"
    return white, pupil
EYES = [eye(392, 116, 118, 22, 42, 54, 62, -12), eye(626, 98, 102, 20, 37, 48, 52, -10)]

def svg(inner, vb="0 0 1024 1024"):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" width="1024" height="1024">{inner}</svg>'
def layer_body(): return f'<g transform="{ROT}" fill="{P["purple"]}"><path d="{body_path()}"/>' + "".join(f'<path d="{t}"/>' for t in TUFTS) + "</g>"
def layer_beak(): return f'<g transform="{ROT}"><path d="{beak_path()}" fill="{P["lime"]}"/></g>'
def layer_eyes(tag=False):
    out = []
    for i,(w,p) in enumerate(EYES):
        a = f' data-evie-part="eye-{"left" if i==0 else "right"}"' if tag else ""
        out.append(f'<g{a}><path d="{w}" fill="{P["white"]}"/><path d="{p}" fill="{P["pupil"]}"/></g>')
    return f'<g transform="{ROT}">' + "".join(out) + "</g>"

if __name__ == "__main__":
    import os
    os.makedirs("out", exist_ok=True)
    open("out/body.svg","w").write(svg(layer_body()))
    open("out/beak.svg","w").write(svg(layer_beak()))
    open("out/eyes.svg","w").write(svg(layer_eyes()))
    open("out/mark.svg","w").write(svg(layer_body()+layer_beak()+layer_eyes()))
    json.dump(dict(purple=P["purple"]), open("out/meta.json","w"))

def web_mark(tile):
    duck = (f'<g data-evie-part="duck"><g transform="{ROT}">'
            f'<g fill="{P["purple"]}"><path d="{body_path()}"/>' + "".join(f'<path d="{t}"/>' for t in TUFTS) + '</g>'
            f'<path data-evie-part="beak" d="{beak_path()}" fill="{P["lime"]}"/>')
    for i,(w,p) in enumerate(EYES):
        duck += f'<g data-evie-part="eye-{"left" if i==0 else "right"}"><path d="{w}" fill="{P["white"]}"/><path d="{p}" fill="{P["pupil"]}"/></g>'
    duck += '</g></g>'
    if tile:
        return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024"><rect width="1024" height="1024" rx="230" fill="#ffffff"/>{duck}</svg>\n'
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="126 130 740 740" width="740" height="740">{duck}</svg>\n'

def write_web(dst):
    open(f"{dst}/evie-mark.svg","w").write(web_mark(True))
    open(f"{dst}/evie-sidebar-mark.svg","w").write(web_mark(False))
