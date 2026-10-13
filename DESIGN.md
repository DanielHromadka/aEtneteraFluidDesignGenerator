# Fluid poster generator — definice vizuálu

## Co je na plakátech

**Pozadí = „liquid silk“** – tekutá, lesklá látka / mramorovaný inkoust, rozmazaný (bez ostrých hran).

| Role | Barva | Kde |
|---|---|---|
| Lime (akcent) | `#CDEB12` → světlá `#E6FF5A` | široké „pásy“ protékající plakátem |
| Lavender | `#8C8DD0` → odlesk `#C3C4F2` | lesklé hřbety záhybů |
| Slate / dark | `#22262F` – `#3A3F55` | prohlubně záhybů, přechod mezi lime a lavender |

Vlastnosti:
- **Proudění** – tvary vypadají jako vícenásobně zkroucená kapalina (vír ve víru).
- **Dva režimy**: *swirl* (plakát 1 – víry, organické) a *streak* (plakát 2 – diagonální natažené pruhy).
- **3D lesk** – záhyby mají světlo a stín, levandulová má skoro bílé spekulární odlesky.
- **Přechod lime → tmavá → lavender** – mezi limetkou a levandulí je vždy tmavý „stín“, barvy se nemíchají napřímo.
- **Nízká frekvence** – jen pár velkých tvarů na plakát, žádný jemný šum (kromě lehkého zrna).

Typografie: geometrický sans (zde *Outfit*), malá písmena, buď
1. **vertical** – název otočený o 90°, lime, přes celou výšku; `&` vlevo dole, claim vpravo dole,
2. **stacked** – velký headline (bold, téměř bílý), pod ním název (light), logo dole uprostřed,
3. **minimal** – jen pozadí, `&`, claim a otisk hashe.

## Jak funguje generátor

```
soubor ──SHA-256──► 32 bajtů ──► parametry ──► WebGL shader ──► canvas + typografie ──► PNG
```

1. `crypto.subtle.digest('SHA-256', bytes)` – deterministické, stejný soubor = stejný plakát.
2. **Bajty → parametry** (použito 31 z 32 bajtů):
   - `0–15` → 8 seedů (offsety šumu, 2 bajty na hodnotu)
   - `16` měřítko, `17` síla warpu, `18` úhel proudění, `19` anizotropie (swirl ↔ streak)
   - `20` podíl plochy lime (30–55 %), `21` podíl tmavého pásu (10–20 %), `22` síla lesku, `23` reliéf
   - `24` počet oktáv, `25` odstín levandule, `26` jas lime, `27` pozice světla
   - `29–30` odstín tmavé / břidlicové, `31` layout (`28` je volný)
3. **Shader** – *domain warping* (Inigo Quilez):
   `f = fbm(p + k·r)`, `r = fbm(p + k·q)`, `q = fbm(p)`
   - prostor `p` je otočený o úhel a natažený (anizotropie) → víry nebo pruhy,
   - `f` z konečných diferencí → normála → difuzní světlo + spekulár (lesk látky),
   - barevná rampa lavender → dark → lime podle `g = 0.65·f + 0.45·r.y + 0.15·q.x`,
   - **kalibrace**: nejdřív se pole vyrenderuje v 64×96, přečte se zpět (`readPixels`)
     a prahy rampy se nastaví podle percentilů, takže každý plakát má stejný poměr barev
     bez ohledu na to, jak „divoký“ šum seed vygeneroval,
   - jemné zrno a vinětace.
4. **Kompozice** – WebGL canvas se vykreslí do 2D canvasu a přes něj se vysází text (layout podle bajtu 31 nebo ručně).
