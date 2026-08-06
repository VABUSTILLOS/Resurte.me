import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const PRODUCTS: Array<
  [
    string,
    string,
    string,
    string,
    string,
    number,
    boolean,
    string
  ]
> = [
  ["Pan Brioche","pan-brioche","Pan brioche suave con mantequilla.","/images/products/recipe/pan-brioche.webp","Benny",5,false,"paquete 4 pz"],
  ["Queso Cheddar Rebanado","queso-cheddar-rebanado","Rebanadas de queso cheddar americano.","/images/products/recipe/queso-cheddar-rebanado.webp","Kraft",3,true,"paquete 200 g"],
  ["Pepinillos","pepinillos","Pepinillos encurtidos agridulces en rodajas.","/images/products/recipe/pepinillos.webp","Vlasic",1,true,"frasco 500 g"],
  ["Salchicha Jumbo","salchicha-jumbo","Salchicha estilo Frankfurt jumbo para hot dogs.","/images/products/recipe/salchicha-jumbo.webp","FUD",4,true,"paquete 6 pz"],
  ["Pepinillos Encurtidos","pepinillos-encurtidos","Pepinillos enteros encurtidos en salmuera.","/images/products/recipe/pepinillos-encurtidos.webp","Vlasic",1,true,"frasco 1 L"],
  ["Chiles Jalapeños Encurtidos","chiles-jalapenos-encurtidos","Jalapeños en escabeche tatemados.","/images/products/recipe/chiles-jalapenos-encurtidos.webp","La Costeña",1,true,"lata 380 g"],
  ["Papas Congeladas","papas-congeladas","Papas pre-fritas congeladas para freír.","/images/products/recipe/papas-congeladas.webp","McCain",9,false,"bolsa 1 kg"],
  ["Aceite Vegetal","aceite-vegetal","Aceite vegetal para freír y cocinar.","/images/products/recipe/aceite-vegetal.webp","1-2-3",2,true,"botella 1 L"],
  ["Aros de Cebolla","aros-de-cebolla","Aros de cebolla empanizados congelados.","/images/products/recipe/aros-de-cebolla.webp","McCain",9,false,"bolsa 500 g"],
  ["Salsa BBQ","salsa-bbq","Salsa barbacoa ahumada estilo Kansas City.","/images/products/recipe/salsa-bbq.webp","Hunts",7,true,"botella 500 ml"],
  ["Frijoles Refritos","frijoles-refritos","Frijoles refritos tradicionales listos para servir.","/images/products/recipe/frijoles-refritos.webp","La Sierra",7,true,"lata 580 g"],
  ["Panko","panko","Pan molido japonés para empanizados extra crujientes.","/images/products/recipe/panko.webp","Kikkoman",2,true,"bolsa 200 g"],
  ["Huevo Fresco","huevo-fresco","Huevo blanco fresco de gallina para cocina diaria.","/images/products/recipe/huevo-fresco.webp","San Juan",3,true,"caja 30 pz"],
  ["Aderezo Ranch","aderezo-ranch","Aderezo ranch cremoso para ensaladas y dips.","/images/products/recipe/aderezo-ranch.webp","McCormick",7,true,"botella 355 ml"],
  ["Pierna de Cerdo","pierna-de-cerdo","Pierna de cerdo fresca para carnitas y guisos.","/images/products/recipe/pierna-de-cerdo.webp","Local",4,true,"por kilo"],
  ["Achiote en Pasta","achiote-en-pasta","Pasta de achiote concentrada para cochinita pibil.","/images/products/recipe/achiote-en-pasta.webp","El Yucateco",2,true,"paquete 100 g"],
  ["Chiles Secos Surtidos","chiles-secos-surtidos","Chiles secos variados para moles y adobos.","/images/products/recipe/chiles-secos-surtidos.webp","Local",2,true,"bolsa 250 g"],
  ["Cebolla Cambray","cebolla-cambray","Cebollas cambray tiernas para asar al carbón.","/images/products/recipe/cebolla-cambray.webp","Local",1,true,"por manojo"],
  ["Chile Guajillo","chile-guajillo","Chile guajillo seco de sabor afrutado para adobos.","/images/products/recipe/chile-guajillo.webp","Local",2,true,"bolsa 200 g"],
  ["Manteca de Cerdo","manteca-de-cerdo","Manteca de cerdo pura para fritura tradicional.","/images/products/recipe/manteca-de-cerdo.webp","Local",2,true,"por kilo"],
  ["Hoja de Laurel","hoja-de-laurel","Hojas de laurel secas para guisos y caldos.","/images/products/recipe/hoja-de-laurel.webp","Local",2,true,"bolsa 20 g"],
  ["Flor de Calabaza","flor-de-calabaza","Flor de calabaza fresca para quesadillas y sopas.","/images/products/recipe/flor-de-calabaza.webp","Local",1,true,"por manojo"],
  ["Chile Chipotle","chile-chipotle","Chipotles en adobo para salsas y guisos ahumados.","/images/products/recipe/chile-chipotle.webp","La Costeña",2,true,"lata 230 g"],
  ["Alga Nori","alga-nori","Hojas de alga nori tostada para sushi rolls.","/images/products/recipe/alga-nori.webp","Kikkoman",2,true,"paquete 10 hojas"],
  ["Surimi","surimi","Palitos de surimi para sushi california y ensaladas.","/images/products/recipe/surimi.webp","Del Pacifico",4,true,"paquete 250 g"],
  ["Jengibre Encurtido","jengibre-encurtido","Jengibre rosado encurtido para sushi (gari).","/images/products/recipe/jengibre-encurtido.webp","Kikkoman",2,true,"frasco 200 g"],
  ["Huesos de Cerdo","huesos-de-cerdo","Huesos de cerdo para caldo de ramen tonkotsu.","/images/products/recipe/huesos-de-cerdo.webp","Local",4,true,"por kilo"],
  ["Fideos Ramen","fideos-ramen","Fideos para ramen estilo japonés, cocción rápida.","/images/products/recipe/fideos-ramen.webp","Maruchan",2,true,"paquete 500 g"],
  ["Jengibre Fresco","jengibre-fresco","Raíz de jengibre fresco para cocina asiática.","/images/products/recipe/jengibre-fresco.webp","Local",1,true,"por 100 g"],
  ["Carne de Cerdo Molida","carne-de-cerdo-molida","Carne de cerdo molida para gyoza y dumplings.","/images/products/recipe/carne-de-cerdo-molida.webp","Local",4,true,"por kilo"],
  ["Col China","col-china","Col china (hakusai) para ramen, salteados y kimchi.","/images/products/recipe/col-china.webp","Local",1,true,"por pieza"],
  ["Cebollín","cebollin","Cebollín fresco para guarnición de sushi y ramen.","/images/products/recipe/cebollin.webp","Local",1,true,"por manojo"],
  ["Pasta Wonton","pasta-wonton","Cuadros de pasta fina para wonton y dumplings.","/images/products/recipe/pasta-wonton.webp","Local",5,true,"paquete 50 hojas"],
  ["Pasta de Tamarindo","pasta-de-tamarindo","Concentrado de tamarindo para salsas agridulces.","/images/products/recipe/pasta-de-tamarindo.webp","Local",2,true,"frasco 300 g"],
  ["Germinado de Soya","germinado-de-soya","Germinado de soya fresco para salteados y ramen.","/images/products/recipe/germinado-de-soya.webp","Local",1,true,"bolsa 200 g"],
  ["Salsa de Anguila","salsa-de-anguila","Salsa dulce de anguila (unagi) para sushi glaze.","/images/products/recipe/salsa-de-anguila.webp","Kikkoman",7,true,"botella 200 ml"],
  ["Puré de Tomate Enlatado","pure-de-tomate-enlatado","Puré de tomate italiano para salsas y bases.","/images/products/recipe/pure-de-tomate-enlatado.webp","La Fina",7,true,"lata 794 g"],
  ["Queso Mozzarella","queso-mozzarella","Queso mozzarella fresco para pizzas, ideal para fundir.","/images/products/recipe/queso-mozzarella.webp","Local",3,true,"por kilo"],
  ["Albahaca Fresca","albahaca-fresca","Albahaca fresca italiana de hoja grande para pesto y pizzas.","/images/products/recipe/albahaca-fresca.webp","Local",1,true,"por manojo"],
  ["Levadura","levadura","Levadura seca instantánea para panes y masas.","/images/products/recipe/levadura.webp","Levapan",5,true,"sobre 11 g"],
  ["Pepperoni","pepperoni","Pepperoni rebanado para pizzas estilo americano.","/images/products/recipe/pepperoni.webp","FUD",4,true,"paquete 200 g"],
  ["Champiñones Frescos","champinones-frescos","Champiñones frescos rebanados para pizzas y salteados.","/images/products/recipe/champinones-frescos.webp","Local",1,true,"charola 250 g"],
  ["Pimiento Morrón","pimiento-morron","Pimiento morrón de colores para pizzas y asados.","/images/products/recipe/pimiento-morron.webp","Local",1,true,"por kilo"],
  ["Pasta Fettuccine","pasta-fettuccine","Pasta larga fettuccine de sémola de trigo.","/images/products/recipe/pasta-fettuccine.webp","Barilla",2,true,"paquete 500 g"],
  ["Queso Parmesano","queso-parmesano","Queso parmesano añejo para rallar fresco.","/images/products/recipe/queso-parmesano.webp","Kraft",3,true,"cuña 200 g"],
  ["Crema para Batir","crema-para-batir","Crema para batir con 35% de grasa para salsas y repostería.","/images/products/recipe/crema-para-batir.webp","Alpura",3,true,"litro"],
  ["Queso Gorgonzola","queso-gorgonzola","Queso azul italiano gorgonzola DOP cremoso.","/images/products/recipe/queso-gorgonzola.webp","Importado",3,true,"cuña 200 g"],
  ["Queso Provolone","queso-provolone","Queso provolone semiduro para sándwiches y gratinados.","/images/products/recipe/queso-provolone.webp","Local",3,true,"por kilo"],
  ["Pasta para Lasaña","pasta-para-lasana","Láminas de pasta para lasaña, precocción.","/images/products/recipe/pasta-para-lasana.webp","Barilla",2,true,"caja 500 g"],
  ["Puré de Jitomate","pure-de-jitomate","Puré de jitomate concentrado para salsas italianas.","/images/products/recipe/pure-de-jitomate.webp","La Fina",7,true,"lata 794 g"],
  ["Soletillas","soletillas","Bizcochos de soletilla para tiramisú y postres.","/images/products/recipe/soletillas.webp","Local",5,true,"paquete 200 g"],
  ["Queso Mascarpone","queso-mascarpone","Queso mascarpone cremoso para tiramisú y postres.","/images/products/recipe/queso-mascarpone.webp","Importado",3,true,"tarrina 250 g"],
  ["Café Espresso","cafe-espresso","Café espresso en grano tostado italiano.","/images/products/recipe/cafe-espresso.webp","Illy",6,true,"bolsa 1 kg"],
  ["Cocoa en Polvo","cocoa-en-polvo","Cocoa en polvo sin azúcar para repostería y moles.","/images/products/recipe/cocoa-en-polvo.webp","Hersheys",7,true,"lata 200 g"],
  ["Salsa Buffalo","salsa-buffalo","Salsa picante estilo buffalo para alitas clásicas.","/images/products/recipe/salsa-buffalo.webp","Franks",7,true,"botella 355 ml"],
  ["Queso Azul","queso-azul","Queso azul para aderezo de alitas y ensaladas.","/images/products/recipe/queso-azul.webp","Local",3,true,"cuña 150 g"],
  ["Pan Molido","pan-molido","Pan molido fino para empanizar pollo y croquetas.","/images/products/recipe/pan-molido.webp","Local",5,true,"bolsa 500 g"],
  ["Romero Fresco","romero-fresco","Romero fresco en rama para marinadas y asados.","/images/products/recipe/romero-fresco.webp","Local",1,true,"por manojo"],
  ["Tomillo Fresco","tomillo-fresco","Tomillo fresco para pollos, pescados y guisos.","/images/products/recipe/tomillo-fresco.webp","Local",1,true,"por manojo"],
  ["Papas Cambray","papas-cambray","Papas cambray gourmet para asar enteras.","/images/products/recipe/papas-cambray.webp","Local",1,true,"por kilo"],
  ["Miel de Abeja","miel-de-abeja","Miel de abeja 100% natural para aderezos y glaseados.","/images/products/recipe/miel-de-abeja.webp","Carlota",7,true,"frasco 500 g"],
  ["Queso Asadero","queso-asadero","Queso asadero para fundir en quesadillas y chiles rellenos.","/images/products/recipe/queso-asadero.webp","Local",3,true,"por kilo"],
  ["Chile Mulato","chile-mulato","Chile mulato seco para moles oscuros tradicionales.","/images/products/recipe/chile-mulato.webp","Local",2,true,"bolsa 150 g"],
  ["Chile Ancho","chile-ancho","Chile ancho seco de sabor dulce y terroso para adobos.","/images/products/recipe/chile-ancho.webp","Local",2,true,"bolsa 150 g"],
  ["Chile Pasilla","chile-pasilla","Chile pasilla seco ahumado para moles y salsas.","/images/products/recipe/chile-pasilla.webp","Local",2,true,"bolsa 150 g"],
  ["Chocolate de Mesa","chocolate-de-mesa","Chocolate de mesa para mole poblano y chocolate caliente.","/images/products/recipe/chocolate-de-mesa.webp","Abuelita",7,true,"tableta 90 g"],
  ["Almendras","almendras","Almendras enteras sin sal para moles y repostería.","/images/products/recipe/almendras.webp","Local",2,true,"bolsa 200 g"],
  ["Pasas","pasas","Pasas para moles, rellenos y picadillo tradicional.","/images/products/recipe/pasas.webp","Local",2,true,"bolsa 200 g"],
  ["Maíz Cacahuazintle","maiz-cacahuazintle","Maíz cacahuazintle de grano grande para pozole.","/images/products/recipe/maiz-cacahuazintle.webp","Local",2,true,"por kilo"],
  ["Pera","pera","Pera fresca para ensaladas, postres y guarniciones.","/images/products/recipe/pera.webp","Local",1,true,"por kilo"],
  ["Nuez de Castilla","nuez-de-castilla","Nuez de castilla para nogada y repostería.","/images/products/recipe/nuez-de-castilla.webp","Local",2,true,"bolsa 200 g"],
  ["Queso de Cabra","queso-de-cabra","Queso de cabra fresco para ensaladas y entradas.","/images/products/recipe/queso-de-cabra.webp","Local",3,true,"por 200 g"],
  ["Granada","granada","Granada roja fresca para chiles en nogada y decoración.","/images/products/recipe/granada.webp","Local",1,true,"por pieza"],
  ["Masa para Tamal","masa-para-tamal","Masa de maíz preparada para tamales.","/images/products/recipe/masa-para-tamal.webp","Local",5,true,"por kilo"],
  ["Hoja de Maíz","hoja-de-maiz","Hojas de maíz secas para tamales.","/images/products/recipe/hoja-de-maiz.webp","Local",2,true,"paquete 100 hojas"],
  ["Caldo de Pollo","caldo-de-pollo","Caldo de pollo concentrado para sopas y arroces.","/images/products/recipe/caldo-de-pollo.webp","Knorr",7,true,"litro"],
  ["Filete de Pescado Blanco","filete-de-pescado-blanco","Filete de pescado blanco del día para ceviches y frituras.","/images/products/recipe/filete-de-pescado-blanco.webp","Local",4,true,"por kilo"],
  ["Jugo de Tomate","jugo-de-tomate","Jugo de tomate sazonado para coctelería y micheladas.","/images/products/recipe/jugo-de-tomate.webp","Del Valle",6,true,"botella 1 L"],
  ["Salsa Picante","salsa-picante","Salsa picante mexicana para mariscos y botanas.","/images/products/recipe/salsa-picante.webp","Valentina",7,true,"botella 150 ml"],
  ["Sal de Grano","sal-de-grano","Sal de grano para terminar carnes asadas.","/images/products/recipe/sal-de-grano.webp","Local",2,true,"por kilo"],
  ["Costillas de Cerdo","costillas-de-cerdo","Costillas de cerdo frescas para asador y BBQ.","/images/products/recipe/costillas-de-cerdo.webp","Local",4,true,"por kilo"],
  ["Azúcar Mascabado","azucar-mascabado","Azúcar mascabado sin refinar para rubs y adobos.","/images/products/recipe/azucar-mascabado.webp","Local",2,true,"por kilo"],
  ["Pimentón","pimenton","Pimentón español ahumado para carnes y embutidos.","/images/products/recipe/pimenton.webp","McCormick",2,true,"frasco 100 g"],
  ["Cebolla en Polvo","cebolla-en-polvo","Cebolla en polvo para sazonadores y rubs.","/images/products/recipe/cebolla-en-polvo.webp","McCormick",2,true,"frasco 100 g"],
  ["Suadero de Res","suadero-de-res","Suadero de res para tacos de plancha.","/images/products/recipe/suadero-de-res.webp","Local",4,true,"por kilo"],
  ["Salsa Verde","salsa-verde","Salsa verde mexicana de tomate y chile serrano.","/images/products/recipe/salsa-verde.webp","La Costeña",7,true,"frasco 370 g"],
  ["Nutella","nutella","Crema de avellana y chocolate para crepas y hotcakes.","/images/products/recipe/nutella.webp","Nutella",7,true,"frasco 350 g"],
  ["Harina para Hot Cakes","harina-para-hot-cakes","Mezcla preparada para hot cakes esponjosos.","/images/products/recipe/harina-para-hot-cakes.webp","Hot Cakes",5,true,"caja 800 g"],
  ["Miel de Maple","miel-de-maple","Miel de maple pura para hotcakes, waffles y crepas.","/images/products/recipe/miel-de-maple.webp","Aunt Jemima",7,true,"botella 250 ml"],
  ["Café en Grano","cafe-en-grano","Café en grano de altura para espresso y americano.","/images/products/recipe/cafe-en-grano.webp","Local",6,true,"bolsa 1 kg"],
  ["Zarzamora","zarzamora","Zarzamora fresca para smoothies, bowls y repostería.","/images/products/recipe/zarzamora.webp","Driscolls",1,true,"charola 170 g"],
  ["Atún Fresco","atun-fresco","Atún fresco en lomo para poke bowls y tataki.","/images/products/recipe/atun-fresco.webp","Local",4,true,"por kilo"],
  ["Edamame","edamame","Vainas de soya edamame para bowls y botanas.","/images/products/recipe/edamame.webp","Birds Eye",1,true,"bolsa 400 g"],
  ["Pan para Crutones","pan-para-crutones","Cubos de pan sazonado para crutones de ensalada César.","/images/products/recipe/pan-para-crutones.webp","Bimbo",5,true,"bolsa 300 g"],
  ["Quinoa","quinoa","Quinoa real blanca, alto contenido de proteína vegetal.","/images/products/recipe/quinoa.webp","Local",2,true,"bolsa 500 g"],
  ["Jitomate Cherry","jitomate-cherry","Jitomate cherry dulce para ensaladas y bowls.","/images/products/recipe/jitomate-cherry.webp","Local",1,true,"charola 250 g"],
  ["Aceituna Kalamata","aceituna-kalamata","Aceitunas kalamata griegas para ensaladas mediterráneas.","/images/products/recipe/aceituna-kalamata.webp","Local",2,true,"frasco 300 g"],
  ["Queso Feta","queso-feta","Queso feta griego en salmuera para ensaladas frescas.","/images/products/recipe/queso-feta.webp","Local",3,true,"por 200 g"],
  ["Tortilla Integral","tortilla-integral","Tortillas de harina integral para wraps saludables.","/images/products/recipe/tortilla-integral.webp","Tía Rosa",5,true,"paquete 12 pz"],
  ["Yogur Griego","yogur-griego","Yogur griego natural sin azúcar para bowls y aderezos.","/images/products/recipe/yogur-griego.webp","Yoplait",3,true,"litro"],
  ["Chispas de Chocolate","chispas-de-chocolate","Chispas de chocolate semiamargo para galletas y repostería.","/images/products/recipe/chispas-de-chocolate.webp","Hersheys",7,true,"bolsa 300 g"],
  ["Yemas de Huevo","yemas-de-huevo","Yemas de huevo pasteurizadas para cremas y repostería.","/images/products/recipe/yemas-de-huevo.webp","San Juan",3,true,"litro pasteurizado"],
  ["Canela en Polvo","canela-en-polvo","Canela molida para postres, arroz con leche y repostería.","/images/products/recipe/canela-en-polvo.webp","McCormick",2,true,"frasco 100 g"],
  ["Cajeta","cajeta","Cajeta de leche de cabra estilo tradicional.","/images/products/recipe/cajeta.webp","Coronado",7,true,"frasco 350 g"],
  ["Pan Pita","pan-pita","Pan pita estilo árabe para shawarma y falafel.","/images/products/recipe/pan-pita.webp","Local",5,true,"paquete 6 pz"],
  ["Jocoque","jocoque","Jocoque seco para aderezos y tacos árabes.","/images/products/recipe/jocoque.webp","Local",3,true,"frasco 500 g"],
  ["Eneldo Fresco","eneldo-fresco","Eneldo fresco para tzatziki y cocina griega.","/images/products/recipe/eneldo-fresco.webp","Local",1,true,"por manojo"],
  ["Tahini","tahini","Pasta de ajonjolí tahini para hummus y salsas.","/images/products/recipe/tahini.webp","Local",2,true,"frasco 300 g"],
  ["Pasta Filo","pasta-filo","Hojas de pasta filo para baklava y pasteles.","/images/products/recipe/pasta-filo.webp","Local",5,true,"caja 500 g"],
  ["Pistache","pistache","Pistache sin sal para repostería árabe y helados.","/images/products/recipe/pistache.webp","Local",2,true,"bolsa 200 g"],
  ["Harina PAN","harina-pan","Harina de maíz precocida para arepas auténticas.","/images/products/recipe/harina-pan.webp","PAN",2,true,"paquete 1 kg"],
  ["Achiote","achiote","Semillas de achiote para dar color natural a las comidas.","/images/products/recipe/achiote.webp","Local",2,true,"bolsa 50 g"],
  ["Maíz Tierno","maiz-tierno","Maíz tierno en grano para cachapas y arepas dulces.","/images/products/recipe/maiz-tierno.webp","Del Monte",1,true,"lata 410 g"],
  ["Queso de Mano","queso-de-mano","Queso blanco venezolano de mano para arepas.","/images/products/recipe/queso-de-mano.webp","Local",3,true,"por kilo"],
  ["Queso Blanco","queso-blanco","Queso blanco duro para rallar, estilo llanero.","/images/products/recipe/queso-blanco.webp","Local",3,true,"por kilo"],
  ["Frijoles Rojos","frijoles-rojos","Frijoles rojos para pabellón criollo y sopas.","/images/products/recipe/frijoles-rojos.webp","La Sierra",2,true,"bolsa 1 kg"],
  ["Chicharrón","chicharron","Chicharrón de cerdo para freír y guisos latinos.","/images/products/recipe/chicharron.webp","Local",4,true,"por kilo"],
  ["Cerveza Clara","cerveza-clara","Cerveza clara tipo lager para micheladas y servicio.","/images/products/recipe/cerveza-clara.webp","Modelo",6,false,"six 355 ml"],
  ["Chile en Polvo","chile-en-polvo","Chile en polvo con limón para botanas y micheladas.","/images/products/recipe/chile-en-polvo.webp","Tajín",2,true,"frasco 150 g"],
  ["Jalapeños en Escabeche","jalapenos-en-escabeche","Jalapeños en escabeche para botanear.","/images/products/recipe/jalapenos-en-escabeche.webp","La Costeña",7,true,"lata 380 g"],
  ["Hierbabuena Fresca","hierbabuena-fresca","Hierbabuena fresca para mojitos, tés y coctelería.","/images/products/recipe/hierbabuena-fresca.webp","Local",1,true,"por manojo"],
  ["Tequila Blanco","tequila-blanco","Tequila blanco joven para coctelería y barra.","/images/products/recipe/tequila-blanco.webp","José Cuervo",6,false,"botella 750 ml"],
  ["Licor de Naranja","licor-de-naranja","Licor de naranja triple sec para margaritas y coctelería.","/images/products/recipe/licor-de-naranja.webp","Controy",6,false,"botella 750 ml"],
  ["Ron Blanco","ron-blanco","Ron blanco para mojitos, cuba libre y coctelería.","/images/products/recipe/ron-blanco.webp","Bacardi",6,false,"botella 750 ml"],
];

const PRICES: Record<number, number[]> = {
  1: [38,45,32,42,35,28,35,30,32,28,38,28,25,22,35,30,42,28,32,35,28,32,30],
  2: [26,32,22,28,24,28,25,18,25,26,22,28,32,42,35,28,26,28,35,38,35,32,28,30,25,22,35,28,26,32,30,28,22,28,25],
  3: [52,28,48,68,65,58,42,72,68,62,42,35,48,42,55,48,32],
  4: [95,88,72,85,68,95,125,88,78,85,68],
  5: [42,28,32,18,36,32,28,25,28,38,35],
  6: [185,22,195,285,36,185,165],
  7: [35,18,65,38,32,35,25,28,22,48,28,35,32,28,42,35,28,32],
  9: [62,55],
};

export async function POST(request: Request) {
  const token = request.headers.get("x-seed-token");
  if (token !== "resurte-seed-2024") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const results = {
    products_inserted: 0,
    products_skipped: 0,
    prices_upserted: 0,
    errors: [] as string[],
  };

  // Step 0: Check which slugs already exist
  const allSlugs = PRODUCTS.map((p) => p[1]);
  const { data: existing, error: existErr } = await supabase
    .from("products")
    .select("slug")
    .in("slug", allSlugs);
  if (existErr) {
    return NextResponse.json({ error: "Failed to check existing slugs: " + existErr.message }, { status: 500 });
  }
  const existingSlugs = new Set((existing ?? []).map((p) => p.slug));
  const newProducts = PRODUCTS.filter((p) => !existingSlugs.has(p[1]));

  // Step 1: Insert products in batches of 30
  const BATCH = 30;
  for (let i = 0; i < newProducts.length; i += BATCH) {
    const batch = newProducts.slice(i, i + BATCH).map(
      ([name, slug, description, image_url, brand, category_id, show_in_whatsapp, unit]) => ({
        name, slug, description, image_url, brand, category_id, show_in_whatsapp, unit,
      })
    );
    const { error } = await supabase.from("products").insert(batch);
    if (error) {
      results.errors.push(`Batch ${i / BATCH}: ${error.message}`);
    } else {
      results.products_inserted += batch.length;
    }
  }

  // Step 2: Fetch ALL product IDs (existing + new) for pricing by slug
  const { data: inserted, error: fetchErr } = await supabase
    .from("products")
    .select("id,category_id,slug")
    .in("slug", allSlugs);

  if (fetchErr) {
    return NextResponse.json({ ...results, error: fetchErr.message }, { status: 500 });
  }

  // Step 3: Group by category and track position within category
  const catCounters: Record<number, number> = {};
  const prices: { product_id: number; store_id: number; price: number; sale_price: null; stock_status: string }[] = [];

  for (const p of inserted) {
    const cat = p.category_id;
    if (!catCounters[cat]) catCounters[cat] = 0;
    const idx = catCounters[cat];
    catCounters[cat]++;

    const priceMap = PRICES[cat];
    if (!priceMap) continue;

    prices.push(
      { product_id: p.id, store_id: 1, price: priceMap[idx] ?? priceMap[priceMap.length - 1], sale_price: null, stock_status: "in_stock" }
    );
  }

  // Step 4: Upsert prices
  const PRICE_BATCH = 60;
  for (let i = 0; i < prices.length; i += PRICE_BATCH) {
    const batch = prices.slice(i, i + PRICE_BATCH);
    const { error } = await supabase.from("product_stores").upsert(batch, { onConflict: "product_id,store_id" });
    if (error) {
      results.errors.push(`Price batch ${i / PRICE_BATCH}: ${error.message}`);
    } else {
      results.prices_upserted += batch.length;
    }
  }

  return NextResponse.json(results);
}
