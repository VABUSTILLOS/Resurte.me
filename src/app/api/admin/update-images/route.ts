/**
 * POST /api/admin/update-images
 *
 * Updates product images in Supabase.
 * - 53 products use original resurte.me store images (GCS)
 * - 86 products use local Alsuper images
 * - 48 products without images are deleted from DB
 */
import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"

const ADMIN_SECRET = process.env.ADMIN_API_SECRET || "resurte-me-migrate-2024"

const IMAGE_UPDATES: Record<number, string> = {
  1: "https://storage.googleapis.com/takeapp/media/cmihp02pp000604l43fzq2ed7.png",
  2: "https://storage.googleapis.com/takeapp/media/cmihov9fh001304ju8yfi21dq.png",
  3: "https://storage.googleapis.com/takeapp/media/cmihon5gm000f04jo8q5f7jdf.png",
  4: "https://storage.googleapis.com/takeapp/media/cmijnpm2z000904lbg1e59xve.png",
  5: "https://storage.googleapis.com/takeapp/media/cmijp7zpj000404l40mtkbyuh.png",
  6: "https://storage.googleapis.com/takeapp/media/cmijo779j000204jz2yrwe753.png",
  7: "/images/products/7.png",
  8: "/images/products/8.png",
  9: "https://storage.googleapis.com/takeapp/media/cmijostxx001o04jv3tl8b2v9.png",
  10: "/images/products/10.png",
  11: "https://storage.googleapis.com/takeapp/media/cmijwgf7r000904l738kc1xwb.png",
  12: "https://storage.googleapis.com/takeapp/media/cmijq38em001604l7hja83595.png",
  13: "https://storage.googleapis.com/takeapp/media/cmijy9mol000104jr05q555i9.png",
  14: "https://storage.googleapis.com/takeapp/media/cmijt78vd000304l7gky09s9z.png",
  15: "https://storage.googleapis.com/takeapp/media/cmil8aa8y001b04jodgx5fcbu.png",
  16: "https://storage.googleapis.com/takeapp/media/cmikmo2xq000304l8d0pmawqd.png",
  17: "https://storage.googleapis.com/takeapp/media/cmikmw51n000304jz0r6shapj.png",
  18: "https://storage.googleapis.com/takeapp/media/cmijqtay4000604js048vejxu.png",
  19: "https://storage.googleapis.com/takeapp/media/cmijtu4fq000204jy1h4p53xa.png",
  20: "https://storage.googleapis.com/takeapp/media/cmihqyxja000b04l5h1s4euob.png",
  21: "https://storage.googleapis.com/takeapp/media/cmijjlfbn000504ie32jadi6o.png",
  22: "https://storage.googleapis.com/takeapp/media/cmigud8dq000n04jp1kc96rqk.png",
  23: "https://storage.googleapis.com/takeapp/media/cmihm7h13000104jsc7rz709l.png",
  24: "https://storage.googleapis.com/takeapp/media/cmihm9eva000804kwbbsuf58x.png",
  25: "https://storage.googleapis.com/takeapp/media/cmifgtjlp000b04l5a5r89mmc.jpg",
  26: "https://storage.googleapis.com/takeapp/media/cmil9723z002s04jobceb395t.png",
  27: "https://storage.googleapis.com/takeapp/media/cmigh1lun000104lfbmdi5wgm.jpg",
  28: "https://storage.googleapis.com/takeapp/media/cmihn1bq8000604l53jdqdh3t.png",
  29: "https://storage.googleapis.com/takeapp/media/cmihlx4ko000004jp6pn34jcc.png",
  30: "https://storage.googleapis.com/takeapp/media/cmiguf9xj000c04ih2kpi7szc.png",
  31: "https://storage.googleapis.com/takeapp/media/cmihgsazp000204ib1z4gae1g.png",
  32: "https://storage.googleapis.com/takeapp/media/cmilwesph000704ikfang4orw.png",
  33: "https://storage.googleapis.com/takeapp/media/cmilw6t51000104jq0du3blee.png",
  34: "/images/products/34.png",
  35: "https://storage.googleapis.com/takeapp/media/cmikw8rii000104l7e1vfbfw3.png",
  36: "https://storage.googleapis.com/takeapp/media/cmijm5teg000704lbgiuf2ua2.png",
  37: "https://storage.googleapis.com/takeapp/media/cmikz37kb000004l5d2653hrg.png",
  38: "https://storage.googleapis.com/takeapp/media/cmihqf2pi000704la16zb486c.png",
  39: "https://storage.googleapis.com/takeapp/media/cmij91iox000804l6hp3j6ul8.png",
  40: "https://storage.googleapis.com/takeapp/media/cmijj1878000004k0bji0clqu.png",
  41: "https://storage.googleapis.com/takeapp/media/cmijn2j9r000304js6krldwj1.png",
  42: "https://storage.googleapis.com/takeapp/media/cmihhifyb000004jv1j7x5wbp.png",
  43: "https://storage.googleapis.com/takeapp/media/cmigufsl3000604l59l4of2yy.png",
  44: "https://storage.googleapis.com/takeapp/media/cmijmdkue000004l5cl6t57qd.png",
  45: "https://storage.googleapis.com/takeapp/media/cmikm2eyl000g04l9h841dwam.png",
  46: "https://storage.googleapis.com/takeapp/media/cmihhsrrr000004jfc58l4cxz.png",
  47: "https://storage.googleapis.com/takeapp/media/cmigr3lni000004l281j40gvp.jpg",
  48: "https://storage.googleapis.com/takeapp/media/cmifh7a6k000004jpa7or85li.jpg",
  49: "/images/products/49.png",
  50: "/images/products/50.png",
  51: "/images/products/51.png",
  52: "/images/products/52.png",
  53: "/images/products/53.png",
  54: "/images/products/54.png",
  55: "/images/products/55.png",
  56: "/images/products/56.png",
  57: "/images/products/57.png",
  59: "/images/products/59.png",
  60: "/images/products/60.png",
  61: "/images/products/61.png",
  64: "/images/products/64.png",
  68: "/images/products/68.png",
  71: "/images/products/71.png",
  72: "/images/products/72.png",
  75: "/images/products/75.png",
  77: "/images/products/77.png",
  80: "/images/products/80.png",
  81: "/images/products/81.png",
  83: "/images/products/83.png",
  85: "/images/products/85.png",
  89: "https://storage.googleapis.com/takeapp/media/cmidk5jyk00000icpgw3gh4pc.webp",
  90: "/images/products/90.png",
  91: "/images/products/91.png",
  92: "/images/products/92.png",
  93: "/images/products/93.png",
  94: "https://storage.googleapis.com/takeapp/media/cmidk59fi00000imqacaggoal.webp",
  95: "https://storage.googleapis.com/takeapp/media/cmidk59fi00000imqacaggoal.webp",
  96: "/images/products/96.png",
  97: "/images/products/97.png",
  98: "/images/products/98.png",
  99: "/images/products/99.png",
  100: "/images/products/100.png",
  101: "https://storage.googleapis.com/takeapp/media/cmidk5taj00000igwdgi364t0.webp",
  102: "/images/products/102.png",
  103: "https://storage.googleapis.com/takeapp/media/cmidk5ahb00000ikx1fo4ebab.webp",
  104: "https://storage.googleapis.com/takeapp/media/cmidk5ucg00000ijff55kb0k6.webp",
  105: "/images/products/105.png",
  106: "/images/products/106.png",
  107: "/images/products/107.png",
  108: "/images/products/108.png",
  111: "/images/products/111.png",
  112: "/images/products/112.png",
  113: "/images/products/113.png",
  115: "https://storage.googleapis.com/takeapp/media/cmigudmvx000p04jp7knq43u4.png",
  116: "/images/products/116.png",
  117: "/images/products/117.png",
  118: "/images/products/118.png",
  119: "/images/products/119.png",
  120: "/images/products/120.png",
  121: "/images/products/121.png",
  122: "/images/products/122.png",
  123: "/images/products/123.png",
  124: "/images/products/124.png",
  126: "/images/products/126.png",
  127: "/images/products/127.png",
  128: "/images/products/128.png",
  129: "/images/products/129.png",
  130: "/images/products/130.png",
  131: "/images/products/131.png",
  132: "/images/products/132.png",
  133: "/images/products/133.png",
  134: "/images/products/134.png",
  137: "/images/products/137.png",
  138: "/images/products/138.png",
  139: "https://storage.googleapis.com/takeapp/media/cmidk5ige00000ij9gnsz26bv.webp",
  140: "https://storage.googleapis.com/takeapp/media/cmidk5ovr00000hka85jr5bzf.webp",
  144: "/images/products/144.png",
  147: "/images/products/147.png",
  149: "/images/products/149.png",
  150: "/images/products/150.png",
  151: "/images/products/151.png",
  152: "/images/products/152.png",
  154: "/images/products/154.png",
  160: "/images/products/160.png",
  162: "/images/products/162.png",
  163: "/images/products/163.png",
  164: "/images/products/164.png",
  169: "/images/products/169.png",
  170: "/images/products/170.png",
  172: "/images/products/172.png",
  173: "/images/products/173.png",
  175: "/images/products/175.png",
  177: "/images/products/177.png",
  178: "/images/products/178.png",
  182: "/images/products/182.png",
  183: "/images/products/183.png",
  184: "/images/products/184.png",
  185: "/images/products/185.png",
  186: "/images/products/186.png",
}

const MULTI_IMAGES: Record<number, string[]> = {
  1: ["https://storage.googleapis.com/takeapp/media/cmihp02pp000604l43fzq2ed7.png", "https://storage.googleapis.com/takeapp/media/cmihp1d5p000904l4ap1f6tf8.png", "https://storage.googleapis.com/takeapp/media/cmihojint000k04if2qg48em7.png"],
  2: ["https://storage.googleapis.com/takeapp/media/cmihov9fh001304ju8yfi21dq.png", "https://storage.googleapis.com/takeapp/media/cmihounrr001004ju2zr0kkrr.png"],
  3: ["https://storage.googleapis.com/takeapp/media/cmihon5gm000f04jo8q5f7jdf.png", "https://storage.googleapis.com/takeapp/media/cmihqf2pi000704la16zb486c.png"],
  4: ["https://storage.googleapis.com/takeapp/media/cmijnpm2z000904lbg1e59xve.png", "https://storage.googleapis.com/takeapp/media/cmijnpqc1000c04lb4mr4b1cy.png"],
  5: ["https://storage.googleapis.com/takeapp/media/cmijp7zpj000404l40mtkbyuh.png", "https://storage.googleapis.com/takeapp/media/cmijp8bq3000604le988t96v6.png"],
  6: ["https://storage.googleapis.com/takeapp/media/cmijo779j000204jz2yrwe753.png", "https://storage.googleapis.com/takeapp/media/cmijo7k5s000504jzcz7ye4bg.png"],
  7: ["/images/products/7.png"],
  8: ["/images/products/8.png"],
  9: ["https://storage.googleapis.com/takeapp/media/cmijostxx001o04jv3tl8b2v9.png", "https://storage.googleapis.com/takeapp/media/cmijosl2y001l04jvck78hm6m.png"],
  10: ["/images/products/10.png"],
  11: ["https://storage.googleapis.com/takeapp/media/cmijwgf7r000904l738kc1xwb.png", "https://storage.googleapis.com/takeapp/media/cmijwgwcq000b04l7bh364jb2.png"],
  12: ["https://storage.googleapis.com/takeapp/media/cmijq38em001604l7hja83595.png", "https://storage.googleapis.com/takeapp/media/cmijq3jh4001904l7b5ua1tia.png"],
  13: ["https://storage.googleapis.com/takeapp/media/cmijy9mol000104jr05q555i9.png", "https://storage.googleapis.com/takeapp/media/cmijy9y2d000304jr51oz2wx0.png"],
  14: ["https://storage.googleapis.com/takeapp/media/cmijt78vd000304l7gky09s9z.png", "https://storage.googleapis.com/takeapp/media/cmijt7m3w000504l725d40nzv.png"],
  15: ["https://storage.googleapis.com/takeapp/media/cmil8aa8y001b04jodgx5fcbu.png", "https://storage.googleapis.com/takeapp/media/cmil8af9n001d04jo0tnf2y5m.png"],
  16: ["https://storage.googleapis.com/takeapp/media/cmikmo2xq000304l8d0pmawqd.png", "https://storage.googleapis.com/takeapp/media/cmikmmodl000504l84zeleisj.png"],
  17: ["https://storage.googleapis.com/takeapp/media/cmikmw51n000304jz0r6shapj.png", "https://storage.googleapis.com/takeapp/media/cmikmx0wp000504jz4j5x1ij2.png"],
  18: ["https://storage.googleapis.com/takeapp/media/cmijqtay4000604js048vejxu.png", "https://storage.googleapis.com/takeapp/media/cmijqtnm5000904jsc56c3o9n.png"],
  19: ["https://storage.googleapis.com/takeapp/media/cmijtu4fq000204jy1h4p53xa.png", "https://storage.googleapis.com/takeapp/media/cmijtugir000404jyckcs1xx4.png"],
  20: ["https://storage.googleapis.com/takeapp/media/cmihqyxja000b04l5h1s4euob.png", "https://storage.googleapis.com/takeapp/media/cmihqz0u3000e04l53hps6u71.png"],
  21: ["https://storage.googleapis.com/takeapp/media/cmijjlfbn000504ie32jadi6o.png", "https://storage.googleapis.com/takeapp/media/cmijjlv27000804ie5n33c2ci.png"],
  22: ["https://storage.googleapis.com/takeapp/media/cmigud8dq000n04jp1kc96rqk.png", "https://storage.googleapis.com/takeapp/media/cmigudi7w000q04jpbzr8whtc.png"],
  23: ["https://storage.googleapis.com/takeapp/media/cmihm7h13000104jsc7rz709l.png", "https://storage.googleapis.com/takeapp/media/cmihm7q5r000404js0ghz1e8d.png"],
  24: ["https://storage.googleapis.com/takeapp/media/cmihm9eva000804kwbbsuf58x.png", "https://storage.googleapis.com/takeapp/media/cmihm9ngw000a04kwb2m6gm6h.png"],
  25: ["https://storage.googleapis.com/takeapp/media/cmifgtjlp000b04l5a5r89mmc.jpg", "https://storage.googleapis.com/takeapp/media/cmifgtpke000e04l528or02g3.jpg"],
  26: ["https://storage.googleapis.com/takeapp/media/cmil9723z002s04jobceb395t.png", "https://storage.googleapis.com/takeapp/media/cmil97bow002u04jodau3fs80.png"],
  27: ["https://storage.googleapis.com/takeapp/media/cmigh1lun000104lfbmdi5wgm.jpg", "https://storage.googleapis.com/takeapp/media/cmigh1r3n000404lfbkx14tun.jpg"],
  28: ["https://storage.googleapis.com/takeapp/media/cmihn1bq8000604l53jdqdh3t.png", "https://storage.googleapis.com/takeapp/media/cmihn1kft000804l5af676n3h.png"],
  29: ["https://storage.googleapis.com/takeapp/media/cmihlx4ko000004jp6pn34jcc.png", "https://storage.googleapis.com/takeapp/media/cmihlxd3u000204jp0dyt3thh.png"],
  30: ["https://storage.googleapis.com/takeapp/media/cmiguf9xj000c04ih2kpi7szc.png", "https://storage.googleapis.com/takeapp/media/cmiguffd8000f04ih1vbr4cub.png"],
  31: ["https://storage.googleapis.com/takeapp/media/cmihgsazp000204ib1z4gae1g.png", "https://storage.googleapis.com/takeapp/media/cmihgsgtn000404ib09b78qrm.png"],
  32: ["https://storage.googleapis.com/takeapp/media/cmilwesph000704ikfang4orw.png", "https://storage.googleapis.com/takeapp/media/cmilwexvb000904ikc5ov3ffv.png"],
  33: ["https://storage.googleapis.com/takeapp/media/cmilw6t51000104jq0du3blee.png", "https://storage.googleapis.com/takeapp/media/cmilw6kb5000204l8hoc09tg9.png"],
  34: ["/images/products/34.png"],
  35: ["https://storage.googleapis.com/takeapp/media/cmikw8rii000104l7e1vfbfw3.png", "https://storage.googleapis.com/takeapp/media/cmikw8wms000304l770o1crl9.png"],
  36: ["https://storage.googleapis.com/takeapp/media/cmijm5teg000704lbgiuf2ua2.png", "https://storage.googleapis.com/takeapp/media/cmijm5z1p000a04lb72yr2qyn.png"],
  37: ["https://storage.googleapis.com/takeapp/media/cmikz37kb000004l5d2653hrg.png", "https://storage.googleapis.com/takeapp/media/cmikz3md8000204l54oh20h6s.png"],
  38: ["https://storage.googleapis.com/takeapp/media/cmihqf2pi000704la16zb486c.png", "https://storage.googleapis.com/takeapp/media/cmihqf9ew000904la3nwxdp0q.png"],
  39: ["https://storage.googleapis.com/takeapp/media/cmij91iox000804l6hp3j6ul8.png", "https://storage.googleapis.com/takeapp/media/cmij91w15000b04l6g9h4gv4r.png"],
  40: ["https://storage.googleapis.com/takeapp/media/cmijj1878000004k0bji0clqu.png", "https://storage.googleapis.com/takeapp/media/cmijj1l50000304k008lw8aq9.png"],
  41: ["https://storage.googleapis.com/takeapp/media/cmijn2j9r000304js6krldwj1.png", "https://storage.googleapis.com/takeapp/media/cmijn2q1z000504js2024s5m50.png"],
  42: ["https://storage.googleapis.com/takeapp/media/cmihhifyb000004jv1j7x5wbp.png", "https://storage.googleapis.com/takeapp/media/cmihhiwpn000304jv4pgf7m7s.png"],
  43: ["https://storage.googleapis.com/takeapp/media/cmigufsl3000604l59l4of2yy.png", "https://storage.googleapis.com/takeapp/media/cmigufy68000804ihcy69c2n4.png"],
  44: ["https://storage.googleapis.com/takeapp/media/cmijmdkue000004l5cl6t57qd.png", "https://storage.googleapis.com/takeapp/media/cmijmdtxh000204l57eu05o4q.png"],
  45: ["https://storage.googleapis.com/takeapp/media/cmikm2eyl000g04l9h841dwam.png", "https://storage.googleapis.com/takeapp/media/cmikm2kyk000i04l99v5y5ag8.png"],
  46: ["https://storage.googleapis.com/takeapp/media/cmihhsrrr000004jfc58l4cxz.png", "https://storage.googleapis.com/takeapp/media/cmihht171000304jfh2lzc04d.png"],
  47: ["https://storage.googleapis.com/takeapp/media/cmigr3lni000004l281j40gvp.jpg", "https://storage.googleapis.com/takeapp/media/cmigr3r7s000304l22p3r4fx5.jpg", "https://storage.googleapis.com/takeapp/media/cmigujm9f000204lk0jfhc8ha.png"],
  48: ["https://storage.googleapis.com/takeapp/media/cmifh7a6k000004jpa7or85li.jpg", "https://storage.googleapis.com/takeapp/media/cmifh7dx3000304jpaymq66n4.jpg"],
  49: ["/images/products/49.png"],
  50: ["/images/products/50.png"],
  51: ["/images/products/51.png"],
  52: ["/images/products/52.png"],
  53: ["/images/products/53.png"],
  54: ["/images/products/54.png"],
  55: ["/images/products/55.png"],
  56: ["/images/products/56.png"],
  57: ["/images/products/57.png"],
  59: ["/images/products/59.png"],
  60: ["/images/products/60.png"],
  61: ["/images/products/61.png"],
  64: ["/images/products/64.png"],
  68: ["/images/products/68.png"],
  71: ["/images/products/71.png"],
  72: ["/images/products/72.png"],
  75: ["/images/products/75.png"],
  77: ["/images/products/77.png"],
  80: ["/images/products/80.png"],
  81: ["/images/products/81.png"],
  83: ["/images/products/83.png"],
  85: ["/images/products/85.png"],
  89: ["https://storage.googleapis.com/takeapp/media/cmidk5jyk00000icpgw3gh4pc.webp"],
  90: ["/images/products/90.png"],
  91: ["/images/products/91.png"],
  92: ["/images/products/92.png"],
  93: ["/images/products/93.png"],
  94: ["https://storage.googleapis.com/takeapp/media/cmidk59fi00000imqacaggoal.webp"],
  95: ["https://storage.googleapis.com/takeapp/media/cmidk59fi00000imqacaggoal.webp"],
  96: ["/images/products/96.png"],
  97: ["/images/products/97.png"],
  98: ["/images/products/98.png"],
  99: ["/images/products/99.png"],
  100: ["/images/products/100.png"],
  101: ["https://storage.googleapis.com/takeapp/media/cmidk5taj00000igwdgi364t0.webp"],
  102: ["/images/products/102.png"],
  103: ["https://storage.googleapis.com/takeapp/media/cmidk5ahb00000ikx1fo4ebab.webp"],
  104: ["https://storage.googleapis.com/takeapp/media/cmidk5ucg00000ijff55kb0k6.webp", "https://storage.googleapis.com/takeapp/media/cmidk60e200030ijffg7mmfo2z.webp"],
  105: ["/images/products/105.png"],
  106: ["/images/products/106.png"],
  107: ["/images/products/107.png"],
  108: ["/images/products/108.png"],
  111: ["/images/products/111.png"],
  112: ["/images/products/112.png"],
  113: ["/images/products/113.png"],
  115: ["https://storage.googleapis.com/takeapp/media/cmigudmvx000p04jp7knq43u4.png", "https://storage.googleapis.com/takeapp/media/cmigudrly000s04jpe45e71lo.png"],
  116: ["/images/products/116.png"],
  117: ["/images/products/117.png"],
  118: ["/images/products/118.png"],
  119: ["/images/products/119.png"],
  120: ["/images/products/120.png"],
  121: ["/images/products/121.png"],
  122: ["/images/products/122.png"],
  123: ["/images/products/123.png"],
  124: ["/images/products/124.png"],
  126: ["/images/products/126.png"],
  127: ["/images/products/127.png"],
  128: ["/images/products/128.png"],
  129: ["/images/products/129.png"],
  130: ["/images/products/130.png"],
  131: ["/images/products/131.png"],
  132: ["/images/products/132.png"],
  133: ["/images/products/133.png"],
  134: ["/images/products/134.png"],
  137: ["/images/products/137.png"],
  138: ["/images/products/138.png"],
  139: ["https://storage.googleapis.com/takeapp/media/cmidk5ige00000ij9gnsz26bv.webp", "https://storage.googleapis.com/takeapp/media/cmidk5o07000000hkcn2oeaq4.webp"],
  140: ["https://storage.googleapis.com/takeapp/media/cmidk5ovr00000hka85jr5bzf.webp", "https://storage.googleapis.com/takeapp/media/cmidk5uvg00000ijcnvka82k1.webp"],
  144: ["/images/products/144.png"],
  147: ["/images/products/147.png"],
  149: ["/images/products/149.png"],
  150: ["/images/products/150.png"],
  151: ["/images/products/151.png"],
  152: ["/images/products/152.png"],
  154: ["/images/products/154.png"],
  160: ["/images/products/160.png"],
  162: ["/images/products/162.png"],
  163: ["/images/products/163.png"],
  164: ["/images/products/164.png"],
  169: ["/images/products/169.png"],
  170: ["/images/products/170.png"],
  172: ["/images/products/172.png"],
  173: ["/images/products/173.png"],
  175: ["/images/products/175.png"],
  177: ["/images/products/177.png"],
  178: ["/images/products/178.png"],
  182: ["/images/products/182.png"],
  183: ["/images/products/183.png"],
  184: ["/images/products/184.png"],
  185: ["/images/products/185.png"],
  186: ["/images/products/186.png"],
}

// Products without any image — will be deleted from DB
const DELETE_IDS = [58, 62, 63, 65, 66, 67, 69, 70, 73, 74, 76, 78, 79, 82, 84, 86, 87, 88, 109, 110, 114, 125, 135, 136, 141, 142, 143, 145, 146, 148, 153, 155, 156, 157, 158, 159, 161, 165, 166, 167, 168, 171, 174, 176, 179, 180, 181, 187]

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const secret = searchParams.get("secret")

    if (secret !== ADMIN_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const supabase = await createServiceClient()

    // Delete products without images
    let deleted = 0
    if (DELETE_IDS.length > 0) {
      const { error: delErr } = await supabase
        .from("products")
        .delete()
        .in("id", DELETE_IDS)
      
      if (delErr) {
        return NextResponse.json({ error: `Delete failed: ${delErr.message}` }, { status: 500 })
      }
      deleted = DELETE_IDS.length
    }

    // Update images
    let count = 0
    const errors: string[] = []

    for (const [pidStr, imageUrl] of Object.entries(IMAGE_UPDATES)) {
      const pid = parseInt(pidStr)
      const images = MULTI_IMAGES[pid] || [imageUrl]

      const { error } = await supabase
        .from("products")
        .update({ image_url: imageUrl, images, updated_at: new Date().toISOString() })
        .eq("id", pid)

      if (error) {
        errors.push(`Product ${pid}: ${error.message}`)
      } else {
        count++
      }
    }

    return NextResponse.json({
      success: errors.length === 0,
      updated: count,
      deleted,
      total: Object.keys(IMAGE_UPDATES).length,
      errors,
    })
  } catch (err) {
    console.error("[Admin] Image update error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
