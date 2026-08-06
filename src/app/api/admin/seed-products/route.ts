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
  ["Pan Brioche","pan-brioche","Pan brioche suave con mantequilla.","https://images.unsplash.com/photo-1509448614-166f5ff9f2d8?w=600&q=80","Benny",5,false,"paquete 4 pz"],
  ["Queso Cheddar Rebanado","queso-cheddar-rebanado","Rebanadas de queso cheddar americano.","https://images.unsplash.com/photo-15505822435-0d2f6290aa56?w=600&q=80","Kraft",3,true,"paquete 200 g"],
  ["Pepinillos","pepinillos","Pepinillos encurtidos agridulces en rodajas.","https://images.unsplash.com/photo-1598177504383-1e0a7a6cfbb?w=600&q=80","Vlasic",1,true,"frasco 500 g"],
  ["Salchicha Jumbo","salchicha-jumbo","Salchicha estilo Frankfurt jumbo para hot dogs.","https://images.unsplash.com/photo-1603046897888-5c1021482d49?w=600&q=80","FUD",4,true,"paquete 6 pz"],
  ["Pepinillos Encurtidos","pepinillos-encurtidos","Pepinillos enteros encurtidos en salmuera.","https://images.unsplash.com/photo-1598177504383-1e0a7a6cfbb?w=600&q=80","Vlasic",1,true,"frasco 1 L"],
  ["Chiles Jalapeños Encurtidos","chiles-jalapenos-encurtidos","Jalapeños en escabeche tatemados.","https://images.unsplash.com/photo-1566385107-2473ecc9f0a1?w=600&q=80","La Costeña",1,true,"lata 380 g"],
  ["Papas Congeladas","papas-congeladas","Papas pre-fritas congeladas para freír.","https://images.unsplash.com/photo-1576107235292-a2471cfd80d6?w=600&q=80","McCain",9,false,"bolsa 1 kg"],
  ["Aceite Vegetal","aceite-vegetal","Aceite vegetal para freír y cocinar.","https://images.unsplash.com/photo-1474979265790-1c2a608cf8?w=600&q=80","1-2-3",2,true,"botella 1 L"],
  ["Aros de Cebolla","aros-de-cebolla","Aros de cebolla empanizados congelados.","https://images.unsplash.com/photo-1625937283898-5c1021482d49?w=600&q=80","McCain",9,false,"bolsa 500 g"],
  ["Salsa BBQ","salsa-bbq","Salsa barbacoa ahumada estilo Kansas City.","https://images.unsplash.com/photo-1587063867103-b6f615a70d53?w=600&q=80","Hunts",7,true,"botella 500 ml"],
  ["Frijoles Refritos","frijoles-refritos","Frijoles refritos tradicionales listos para servir.","https://images.unsplash.com/photo-1551217873814-1b4390f8ab6c?w=600&q=80","La Sierra",7,true,"lata 580 g"],
  ["Panko","panko","Pan molido japonés para empanizados extra crujientes.","https://images.unsplash.com/photo-1600585058159-0a93c6e8b5f9?w=600&q=80","Kikkoman",2,true,"bolsa 200 g"],
  ["Huevo Fresco","huevo-fresco","Huevo blanco fresco de gallina para cocina diaria.","https://images.unsplash.com/photo-1582722871984-8f3a8de86a9b?w=600&q=80","San Juan",3,true,"caja 30 pz"],
  ["Aderezo Ranch","aderezo-ranch","Aderezo ranch cremoso para ensaladas y dips.","https://images.unsplash.com/photo-1556909212-d7af153b3f26?w=600&q=80","McCormick",7,true,"botella 355 ml"],
  ["Pierna de Cerdo","pierna-de-cerdo","Pierna de cerdo fresca para carnitas y guisos.","https://images.unsplash.com/photo-1603046897888-5c1021482d49?w=600&q=80","Local",4,true,"por kilo"],
  ["Achiote en Pasta","achiote-en-pasta","Pasta de achiote concentrada para cochinita pibil.","https://images.unsplash.com/photo-1599909523127-04dc276376e?w=600&q=80","El Yucateco",2,true,"paquete 100 g"],
  ["Chiles Secos Surtidos","chiles-secos-surtidos","Chiles secos variados para moles y adobos.","https://images.unsplash.com/photo-1566385107-2473ecc9f0a1?w=600&q=80","Local",2,true,"bolsa 250 g"],
  ["Cebolla Cambray","cebolla-cambray","Cebollas cambray tiernas para asar al carbón.","https://images.unsplash.com/photo-1587049355551-c74d1c28ef7a?w=600&q=80","Local",1,true,"por manojo"],
  ["Chile Guajillo","chile-guajillo","Chile guajillo seco de sabor afrutado para adobos.","https://images.unsplash.com/photo-1566385107-2473ecc9f0a1?w=600&q=80","Local",2,true,"bolsa 200 g"],
  ["Manteca de Cerdo","manteca-de-cerdo","Manteca de cerdo pura para fritura tradicional.","https://images.unsplash.com/photo-1551024601-ecb2e8e54b29?w=600&q=80","Local",2,true,"por kilo"],
  ["Hoja de Laurel","hoja-de-laurel","Hojas de laurel secas para guisos y caldos.","https://images.unsplash.com/photo-1599909523127-04dc276376e?w=600&q=80","Local",2,true,"bolsa 20 g"],
  ["Flor de Calabaza","flor-de-calabaza","Flor de calabaza fresca para quesadillas y sopas.","https://images.unsplash.com/photo-1457537301881-07104cf8407e?w=600&q=80","Local",1,true,"por manojo"],
  ["Chile Chipotle","chile-chipotle","Chipotles en adobo para salsas y guisos ahumados.","https://images.unsplash.com/photo-1566385107-2473ecc9f0a1?w=600&q=80","La Costeña",2,true,"lata 230 g"],
  ["Alga Nori","alga-nori","Hojas de alga nori tostada para sushi rolls.","https://images.unsplash.com/photo-1598177504383-1e0a7a6cfbb?w=600&q=80","Kikkoman",2,true,"paquete 10 hojas"],
  ["Surimi","surimi","Palitos de surimi para sushi california y ensaladas.","https://images.unsplash.com/photo-1559737558-2b6cc7885f5d?w=600&q=80","Del Pacifico",4,true,"paquete 250 g"],
  ["Jengibre Encurtido","jengibre-encurtido","Jengibre rosado encurtido para sushi (gari).","https://images.unsplash.com/photo-1611247335938-2b6cc7885f5d?w=600&q=80","Kikkoman",2,true,"frasco 200 g"],
  ["Huesos de Cerdo","huesos-de-cerdo","Huesos de cerdo para caldo de ramen tonkotsu.","https://images.unsplash.com/photo-1551024601-ecb2e8e54b29?w=600&q=80","Local",4,true,"por kilo"],
  ["Fideos Ramen","fideos-ramen","Fideos para ramen estilo japonés, cocción rápida.","https://images.unsplash.com/photo-1612925451970-5729f62bdf52?w=600&q=80","Maruchan",2,true,"paquete 500 g"],
  ["Jengibre Fresco","jengibre-fresco","Raíz de jengibre fresco para cocina asiática.","https://images.unsplash.com/photo-1600028068383-ea11a7a101f3?w=600&q=80","Local",1,true,"por 100 g"],
  ["Carne de Cerdo Molida","carne-de-cerdo-molida","Carne de cerdo molida para gyoza y dumplings.","https://images.unsplash.com/photo-1603046897888-5c1021482d49?w=600&q=80","Local",4,true,"por kilo"],
  ["Col China","col-china","Col china (hakusai) para ramen, salteados y kimchi.","https://images.unsplash.com/photo-1598177504383-1e0a7a6cfbb?w=600&q=80","Local",1,true,"por pieza"],
  ["Cebollín","cebollin","Cebollín fresco para guarnición de sushi y ramen.","https://images.unsplash.com/photo-1587049355551-c74d1c28ef7a?w=600&q=80","Local",1,true,"por manojo"],
  ["Pasta Wonton","pasta-wonton","Cuadros de pasta fina para wonton y dumplings.","https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?w=600&q=80","Local",5,true,"paquete 50 hojas"],
  ["Pasta de Tamarindo","pasta-de-tamarindo","Concentrado de tamarindo para salsas agridulces.","https://images.unsplash.com/photo-1551217873814-1b4390f8ab6c?w=600&q=80","Local",2,true,"frasco 300 g"],
  ["Germinado de Soya","germinado-de-soya","Germinado de soya fresco para salteados y ramen.","https://images.unsplash.com/photo-1598177504383-1e0a7a6cfbb?w=600&q=80","Local",1,true,"bolsa 200 g"],
  ["Salsa de Anguila","salsa-de-anguila","Salsa dulce de anguila (unagi) para sushi glaze.","https://images.unsplash.com/photo-1587063867103-b6f615a70d53?w=600&q=80","Kikkoman",7,true,"botella 200 ml"],
  ["Puré de Tomate Enlatado","pure-de-tomate-enlatado","Puré de tomate italiano para salsas y bases.","https://images.unsplash.com/photo-1551217873814-1b4390f8ab6c?w=600&q=80","La Fina",7,true,"lata 794 g"],
  ["Queso Mozzarella","queso-mozzarella","Queso mozzarella fresco para pizzas, ideal para fundir.","https://images.unsplash.com/photo-1626958390669-524c0e38bcd?w=600&q=80","Local",3,true,"por kilo"],
  ["Albahaca Fresca","albahaca-fresca","Albahaca fresca italiana de hoja grande para pesto y pizzas.","https://images.unsplash.com/photo-1599909523127-04dc276376e?w=600&q=80","Local",1,true,"por manojo"],
  ["Levadura","levadura","Levadura seca instantánea para panes y masas.","https://images.unsplash.com/photo-1587049355551-c74d1c28ef7a?w=600&q=80","Levapan",5,true,"sobre 11 g"],
  ["Pepperoni","pepperoni","Pepperoni rebanado para pizzas estilo americano.","https://images.unsplash.com/photo-1625937283898-5c1021482d49?w=600&q=80","FUD",4,true,"paquete 200 g"],
  ["Champiñones Frescos","champinones-frescos","Champiñones frescos rebanados para pizzas y salteados.","https://images.unsplash.com/photo-1576158113928-12617c7bbe98?w=600&q=80","Local",1,true,"charola 250 g"],
  ["Pimiento Morrón","pimiento-morron","Pimiento morrón de colores para pizzas y asados.","https://images.unsplash.com/photo-1598177504383-1e0a7a6cfbb?w=600&q=80","Local",1,true,"por kilo"],
  ["Pasta Fettuccine","pasta-fettuccine","Pasta larga fettuccine de sémola de trigo.","https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?w=600&q=80","Barilla",2,true,"paquete 500 g"],
  ["Queso Parmesano","queso-parmesano","Queso parmesano añejo para rallar fresco.","https://images.unsplash.com/photo-1626958390669-524c0e38bcd?w=600&q=80","Kraft",3,true,"cuña 200 g"],
  ["Crema para Batir","crema-para-batir","Crema para batir con 35% de grasa para salsas y repostería.","https://images.unsplash.com/photo-15505822435-0d2f6290aa56?w=600&q=80","Alpura",3,true,"litro"],
  ["Queso Gorgonzola","queso-gorgonzola","Queso azul italiano gorgonzola DOP cremoso.","https://images.unsplash.com/photo-1626958390669-524c0e38bcd?w=600&q=80","Importado",3,true,"cuña 200 g"],
  ["Queso Provolone","queso-provolone","Queso provolone semiduro para sándwiches y gratinados.","https://images.unsplash.com/photo-1626958390669-524c0e38bcd?w=600&q=80","Local",3,true,"por kilo"],
  ["Pasta para Lasaña","pasta-para-lasana","Láminas de pasta para lasaña, precocción.","https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?w=600&q=80","Barilla",2,true,"caja 500 g"],
  ["Puré de Jitomate","pure-de-jitomate","Puré de jitomate concentrado para salsas italianas.","https://images.unsplash.com/photo-1551217873814-1b4390f8ab6c?w=600&q=80","La Fina",7,true,"lata 794 g"],
  ["Soletillas","soletillas","Bizcochos de soletilla para tiramisú y postres.","https://images.unsplash.com/photo-1576107235292-a2471cfd80d6?w=600&q=80","Local",5,true,"paquete 200 g"],
  ["Queso Mascarpone","queso-mascarpone","Queso mascarpone cremoso para tiramisú y postres.","https://images.unsplash.com/photo-1626958390669-524c0e38bcd?w=600&q=80","Importado",3,true,"tarrina 250 g"],
  ["Café Espresso","cafe-espresso","Café espresso en grano tostado italiano.","https://images.unsplash.com/photo-1509048194180-8a148911d34?w=600&q=80","Illy",6,true,"bolsa 1 kg"],
  ["Cocoa en Polvo","cocoa-en-polvo","Cocoa en polvo sin azúcar para repostería y moles.","https://images.unsplash.com/photo-1587063867103-b6f615a70d53?w=600&q=80","Hersheys",7,true,"lata 200 g"],
  ["Salsa Buffalo","salsa-buffalo","Salsa picante estilo buffalo para alitas clásicas.","https://images.unsplash.com/photo-1587063867103-b6f615a70d53?w=600&q=80","Franks",7,true,"botella 355 ml"],
  ["Queso Azul","queso-azul","Queso azul para aderezo de alitas y ensaladas.","https://images.unsplash.com/photo-1626958390669-524c0e38bcd?w=600&q=80","Local",3,true,"cuña 150 g"],
  ["Pan Molido","pan-molido","Pan molido fino para empanizar pollo y croquetas.","https://images.unsplash.com/photo-1600585058159-0a93c6e8b5f9?w=600&q=80","Local",5,true,"bolsa 500 g"],
  ["Romero Fresco","romero-fresco","Romero fresco en rama para marinadas y asados.","https://images.unsplash.com/photo-1599909523127-04dc276376e?w=600&q=80","Local",1,true,"por manojo"],
  ["Tomillo Fresco","tomillo-fresco","Tomillo fresco para pollos, pescados y guisos.","https://images.unsplash.com/photo-1599909523127-04dc276376e?w=600&q=80","Local",1,true,"por manojo"],
  ["Papas Cambray","papas-cambray","Papas cambray gourmet para asar enteras.","https://images.unsplash.com/photo-1576107235292-a2471cfd80d6?w=600&q=80","Local",1,true,"por kilo"],
  ["Miel de Abeja","miel-de-abeja","Miel de abeja 100% natural para aderezos y glaseados.","https://images.unsplash.com/photo-1587049355551-c74d1c28ef7a?w=600&q=80","Carlota",7,true,"frasco 500 g"],
  ["Queso Asadero","queso-asadero","Queso asadero para fundir en quesadillas y chiles rellenos.","https://images.unsplash.com/photo-1626958390669-524c0e38bcd?w=600&q=80","Local",3,true,"por kilo"],
  ["Chile Mulato","chile-mulato","Chile mulato seco para moles oscuros tradicionales.","https://images.unsplash.com/photo-1566385107-2473ecc9f0a1?w=600&q=80","Local",2,true,"bolsa 150 g"],
  ["Chile Ancho","chile-ancho","Chile ancho seco de sabor dulce y terroso para adobos.","https://images.unsplash.com/photo-1566385107-2473ecc9f0a1?w=600&q=80","Local",2,true,"bolsa 150 g"],
  ["Chile Pasilla","chile-pasilla","Chile pasilla seco ahumado para moles y salsas.","https://images.unsplash.com/photo-1566385107-2473ecc9f0a1?w=600&q=80","Local",2,true,"bolsa 150 g"],
  ["Chocolate de Mesa","chocolate-de-mesa","Chocolate de mesa para mole poblano y chocolate caliente.","https://images.unsplash.com/photo-1587063867103-b6f615a70d53?w=600&q=80","Abuelita",7,true,"tableta 90 g"],
  ["Almendras","almendras","Almendras enteras sin sal para moles y repostería.","https://images.unsplash.com/photo-1551217873814-1b4390f8ab6c?w=600&q=80","Local",2,true,"bolsa 200 g"],
  ["Pasas","pasas","Pasas para moles, rellenos y picadillo tradicional.","https://images.unsplash.com/photo-1551217873814-1b4390f8ab6c?w=600&q=80","Local",2,true,"bolsa 200 g"],
  ["Maíz Cacahuazintle","maiz-cacahuazintle","Maíz cacahuazintle de grano grande para pozole.","https://images.unsplash.com/photo-1551217873814-1b4390f8ab6c?w=600&q=80","Local",2,true,"por kilo"],
  ["Pera","pera","Pera fresca para ensaladas, postres y guarniciones.","https://images.unsplash.com/photo-1598177504383-1e0a7a6cfbb?w=600&q=80","Local",1,true,"por kilo"],
  ["Nuez de Castilla","nuez-de-castilla","Nuez de castilla para nogada y repostería.","https://images.unsplash.com/photo-1551217873814-1b4390f8ab6c?w=600&q=80","Local",2,true,"bolsa 200 g"],
  ["Queso de Cabra","queso-de-cabra","Queso de cabra fresco para ensaladas y entradas.","https://images.unsplash.com/photo-1626958390669-524c0e38bcd?w=600&q=80","Local",3,true,"por 200 g"],
  ["Granada","granada","Granada roja fresca para chiles en nogada y decoración.","https://images.unsplash.com/photo-1598177504383-1e0a7a6cfbb?w=600&q=80","Local",1,true,"por pieza"],
  ["Masa para Tamal","masa-para-tamal","Masa de maíz preparada para tamales.","https://images.unsplash.com/photo-1551217873814-1b4390f8ab6c?w=600&q=80","Local",5,true,"por kilo"],
  ["Hoja de Maíz","hoja-de-maiz","Hojas de maíz secas para tamales.","https://images.unsplash.com/photo-1551217873814-1b4390f8ab6c?w=600&q=80","Local",2,true,"paquete 100 hojas"],
  ["Caldo de Pollo","caldo-de-pollo","Caldo de pollo concentrado para sopas y arroces.","https://images.unsplash.com/photo-1551024601-ecb2e8e54b29?w=600&q=80","Knorr",7,true,"litro"],
  ["Filete de Pescado Blanco","filete-de-pescado-blanco","Filete de pescado blanco del día para ceviches y frituras.","https://images.unsplash.com/photo-1579403128514-2305bb28ba2?w=600&q=80","Local",4,true,"por kilo"],
  ["Jugo de Tomate","jugo-de-tomate","Jugo de tomate sazonado para coctelería y micheladas.","https://images.unsplash.com/photo-1551217873814-1b4390f8ab6c?w=600&q=80","Del Valle",6,true,"botella 1 L"],
  ["Salsa Picante","salsa-picante","Salsa picante mexicana para mariscos y botanas.","https://images.unsplash.com/photo-1587063867103-b6f615a70d53?w=600&q=80","Valentina",7,true,"botella 150 ml"],
  ["Sal de Grano","sal-de-grano","Sal de grano para terminar carnes asadas.","https://images.unsplash.com/photo-1599909523127-04dc276376e?w=600&q=80","Local",2,true,"por kilo"],
  ["Costillas de Cerdo","costillas-de-cerdo","Costillas de cerdo frescas para asador y BBQ.","https://images.unsplash.com/photo-1603046897888-5c1021482d49?w=600&q=80","Local",4,true,"por kilo"],
  ["Azúcar Mascabado","azucar-mascabado","Azúcar mascabado sin refinar para rubs y adobos.","https://images.unsplash.com/photo-1587049355551-c74d1c28ef7a?w=600&q=80","Local",2,true,"por kilo"],
  ["Pimentón","pimenton","Pimentón español ahumado para carnes y embutidos.","https://images.unsplash.com/photo-1599909523127-04dc276376e?w=600&q=80","McCormick",2,true,"frasco 100 g"],
  ["Cebolla en Polvo","cebolla-en-polvo","Cebolla en polvo para sazonadores y rubs.","https://images.unsplash.com/photo-1599909523127-04dc276376e?w=600&q=80","McCormick",2,true,"frasco 100 g"],
  ["Suadero de Res","suadero-de-res","Suadero de res para tacos de plancha.","https://images.unsplash.com/photo-1551024601-ecb2e8e54b29?w=600&q=80","Local",4,true,"por kilo"],
  ["Salsa Verde","salsa-verde","Salsa verde mexicana de tomate y chile serrano.","https://images.unsplash.com/photo-1587063867103-b6f615a70d53?w=600&q=80","La Costeña",7,true,"frasco 370 g"],
  ["Nutella","nutella","Crema de avellana y chocolate para crepas y hotcakes.","https://images.unsplash.com/photo-1587063867103-b6f615a70d53?w=600&q=80","Nutella",7,true,"frasco 350 g"],
  ["Harina para Hot Cakes","harina-para-hot-cakes","Mezcla preparada para hot cakes esponjosos.","https://images.unsplash.com/photo-1600585058159-0a93c6e8b5f9?w=600&q=80","Hot Cakes",5,true,"caja 800 g"],
  ["Miel de Maple","miel-de-maple","Miel de maple pura para hotcakes, waffles y crepas.","https://images.unsplash.com/photo-1587049355551-c74d1c28ef7a?w=600&q=80","Aunt Jemima",7,true,"botella 250 ml"],
  ["Café en Grano","cafe-en-grano","Café en grano de altura para espresso y americano.","https://images.unsplash.com/photo-1509048194180-8a148911d34?w=600&q=80","Local",6,true,"bolsa 1 kg"],
  ["Zarzamora","zarzamora","Zarzamora fresca para smoothies, bowls y repostería.","https://images.unsplash.com/photo-1598177504383-1e0a7a6cfbb?w=600&q=80","Driscolls",1,true,"charola 170 g"],
  ["Atún Fresco","atun-fresco","Atún fresco en lomo para poke bowls y tataki.","https://images.unsplash.com/photo-1559737558-2b6cc7885f5d?w=600&q=80","Local",4,true,"por kilo"],
  ["Edamame","edamame","Vainas de soya edamame para bowls y botanas.","https://images.unsplash.com/photo-1598177504383-1e0a7a6cfbb?w=600&q=80","Birds Eye",1,true,"bolsa 400 g"],
  ["Pan para Crutones","pan-para-crutones","Cubos de pan sazonado para crutones de ensalada César.","https://images.unsplash.com/photo-1600585058159-0a93c6e8b5f9?w=600&q=80","Bimbo",5,true,"bolsa 300 g"],
  ["Quinoa","quinoa","Quinoa real blanca, alto contenido de proteína vegetal.","https://images.unsplash.com/photo-1551217873814-1b4390f8ab6c?w=600&q=80","Local",2,true,"bolsa 500 g"],
  ["Jitomate Cherry","jitomate-cherry","Jitomate cherry dulce para ensaladas y bowls.","https://images.unsplash.com/photo-1598177504383-1e0a7a6cfbb?w=600&q=80","Local",1,true,"charola 250 g"],
  ["Aceituna Kalamata","aceituna-kalamata","Aceitunas kalamata griegas para ensaladas mediterráneas.","https://images.unsplash.com/photo-1551217873814-1b4390f8ab6c?w=600&q=80","Local",2,true,"frasco 300 g"],
  ["Queso Feta","queso-feta","Queso feta griego en salmuera para ensaladas frescas.","https://images.unsplash.com/photo-1626958390669-524c0e38bcd?w=600&q=80","Local",3,true,"por 200 g"],
  ["Tortilla Integral","tortilla-integral","Tortillas de harina integral para wraps saludables.","https://images.unsplash.com/photo-1600585058159-0a93c6e8b5f9?w=600&q=80","Tía Rosa",5,true,"paquete 12 pz"],
  ["Yogur Griego","yogur-griego","Yogur griego natural sin azúcar para bowls y aderezos.","https://images.unsplash.com/photo-15505822435-0d2f6290aa56?w=600&q=80","Yoplait",3,true,"litro"],
  ["Chispas de Chocolate","chispas-de-chocolate","Chispas de chocolate semiamargo para galletas y repostería.","https://images.unsplash.com/photo-1587063867103-b6f615a70d53?w=600&q=80","Hersheys",7,true,"bolsa 300 g"],
  ["Yemas de Huevo","yemas-de-huevo","Yemas de huevo pasteurizadas para cremas y repostería.","https://images.unsplash.com/photo-1582722871984-8f3a8de86a9b?w=600&q=80","San Juan",3,true,"litro pasteurizado"],
  ["Canela en Polvo","canela-en-polvo","Canela molida para postres, arroz con leche y repostería.","https://images.unsplash.com/photo-1599909523127-04dc276376e?w=600&q=80","McCormick",2,true,"frasco 100 g"],
  ["Cajeta","cajeta","Cajeta de leche de cabra estilo tradicional.","https://images.unsplash.com/photo-1587049355551-c74d1c28ef7a?w=600&q=80","Coronado",7,true,"frasco 350 g"],
  ["Pan Pita","pan-pita","Pan pita estilo árabe para shawarma y falafel.","https://images.unsplash.com/photo-1600585058159-0a93c6e8b5f9?w=600&q=80","Local",5,true,"paquete 6 pz"],
  ["Jocoque","jocoque","Jocoque seco para aderezos y tacos árabes.","https://images.unsplash.com/photo-15505822435-0d2f6290aa56?w=600&q=80","Local",3,true,"frasco 500 g"],
  ["Eneldo Fresco","eneldo-fresco","Eneldo fresco para tzatziki y cocina griega.","https://images.unsplash.com/photo-1599909523127-04dc276376e?w=600&q=80","Local",1,true,"por manojo"],
  ["Tahini","tahini","Pasta de ajonjolí tahini para hummus y salsas.","https://images.unsplash.com/photo-1551217873814-1b4390f8ab6c?w=600&q=80","Local",2,true,"frasco 300 g"],
  ["Pasta Filo","pasta-filo","Hojas de pasta filo para baklava y pasteles.","https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?w=600&q=80","Local",5,true,"caja 500 g"],
  ["Pistache","pistache","Pistache sin sal para repostería árabe y helados.","https://images.unsplash.com/photo-1551217873814-1b4390f8ab6c?w=600&q=80","Local",2,true,"bolsa 200 g"],
  ["Harina PAN","harina-pan","Harina de maíz precocida para arepas auténticas.","https://images.unsplash.com/photo-1551217873814-1b4390f8ab6c?w=600&q=80","PAN",2,true,"paquete 1 kg"],
  ["Achiote","achiote","Semillas de achiote para dar color natural a las comidas.","https://images.unsplash.com/photo-1599909523127-04dc276376e?w=600&q=80","Local",2,true,"bolsa 50 g"],
  ["Maíz Tierno","maiz-tierno","Maíz tierno en grano para cachapas y arepas dulces.","https://images.unsplash.com/photo-1551217873814-1b4390f8ab6c?w=600&q=80","Del Monte",1,true,"lata 410 g"],
  ["Queso de Mano","queso-de-mano","Queso blanco venezolano de mano para arepas.","https://images.unsplash.com/photo-1626958390669-524c0e38bcd?w=600&q=80","Local",3,true,"por kilo"],
  ["Queso Blanco","queso-blanco","Queso blanco duro para rallar, estilo llanero.","https://images.unsplash.com/photo-1626958390669-524c0e38bcd?w=600&q=80","Local",3,true,"por kilo"],
  ["Frijoles Rojos","frijoles-rojos","Frijoles rojos para pabellón criollo y sopas.","https://images.unsplash.com/photo-1551217873814-1b4390f8ab6c?w=600&q=80","La Sierra",2,true,"bolsa 1 kg"],
  ["Chicharrón","chicharron","Chicharrón de cerdo para freír y guisos latinos.","https://images.unsplash.com/photo-1551024601-ecb2e8e54b29?w=600&q=80","Local",4,true,"por kilo"],
  ["Cerveza Clara","cerveza-clara","Cerveza clara tipo lager para micheladas y servicio.","https://images.unsplash.com/photo-1551024707-ee50e2e69dd?w=600&q=80","Modelo",6,false,"six 355 ml"],
  ["Chile en Polvo","chile-en-polvo","Chile en polvo con limón para botanas y micheladas.","https://images.unsplash.com/photo-1599909523127-04dc276376e?w=600&q=80","Tajín",2,true,"frasco 150 g"],
  ["Jalapeños en Escabeche","jalapenos-en-escabeche","Jalapeños en escabeche para botanear.","https://images.unsplash.com/photo-1566385107-2473ecc9f0a1?w=600&q=80","La Costeña",7,true,"lata 380 g"],
  ["Hierbabuena Fresca","hierbabuena-fresca","Hierbabuena fresca para mojitos, tés y coctelería.","https://images.unsplash.com/photo-1599909523127-04dc276376e?w=600&q=80","Local",1,true,"por manojo"],
  ["Tequila Blanco","tequila-blanco","Tequila blanco joven para coctelería y barra.","https://images.unsplash.com/photo-1551024707-ee50e2e69dd?w=600&q=80","José Cuervo",6,false,"botella 750 ml"],
  ["Licor de Naranja","licor-de-naranja","Licor de naranja triple sec para margaritas y coctelería.","https://images.unsplash.com/photo-1551024707-ee50e2e69dd?w=600&q=80","Controy",6,false,"botella 750 ml"],
  ["Ron Blanco","ron-blanco","Ron blanco para mojitos, cuba libre y coctelería.","https://images.unsplash.com/photo-1551024707-ee50e2e69dd?w=600&q=80","Bacardi",6,false,"botella 750 ml"],
];

const PRICES: Record<number, { r: number[]; c: number[] }> = {
  1: { r: [38,45,32,42,35,28,35,30,32,28,38,28,25,22,35,30,42,28,32,35,28,32,30], c: [49,58,42,55,45,36,45,39,42,36,49,36,32,28,45,39,55,36,42,45,36,42,39] },
  2: { r: [26,32,22,28,24,28,25,18,25,26,22,28,32,42,35,28,26,28,35,38,35,32,28,30,25,22,35,28,26,32,30,28,22,28,25], c: [34,42,28,36,31,36,32,23,32,34,28,36,42,55,45,36,34,36,45,49,45,42,36,39,32,28,45,36,34,42,39,36,28,36,32] },
  3: { r: [52,28,48,68,65,58,42,72,68,62,42,35,48,42,55,48,32], c: [68,36,62,88,85,75,55,94,88,81,55,46,62,55,72,62,42] },
  4: { r: [95,88,72,85,68,95,125,88,78,85,68], c: [122,115,94,110,88,122,162,115,100,110,88] },
  5: { r: [42,28,32,18,36,32,28,25,28,38,35], c: [55,36,42,23,47,42,36,32,36,49,46] },
  6: { r: [185,22,195,285,36,185,165], c: [240,28,255,370,47,240,215] },
  7: { r: [35,18,65,38,32,35,25,28,22,48,28,35,32,28,42,35,28,32], c: [46,23,85,49,42,46,32,36,28,62,36,46,42,36,55,46,36,42] },
  9: { r: [62,55], c: [81,72] },
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

  // Step 1: Insert products in batches of 30
  const BATCH = 30;
  for (let i = 0; i < PRODUCTS.length; i += BATCH) {
    const batch = PRODUCTS.slice(i, i + BATCH).map(
      ([name, slug, description, image_url, brand, category_id, show_in_whatsapp, unit]) => ({
        name, slug, description, image_url, brand, category_id, show_in_whatsapp, unit,
      })
    );
    const { error } = await supabase
      .from("products")
      .upsert(batch, { onConflict: "slug" });
    if (error) {
      results.errors.push(`Batch ${i / BATCH}: ${error.message}`);
    } else {
      results.products_inserted += batch.length;
    }
  }

  // Step 2: Fetch inserted product IDs by slug
  const slugs = PRODUCTS.map((p) => p[1]);
  const { data: inserted, error: fetchErr } = await supabase
    .from("products")
    .select("id,category_id,slug")
    .in("slug", slugs);

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
      { product_id: p.id, store_id: 1, price: priceMap.r[idx] ?? priceMap.r[priceMap.r.length - 1], sale_price: null, stock_status: "in_stock" },
      { product_id: p.id, store_id: 2, price: priceMap.c[idx] ?? priceMap.c[priceMap.c.length - 1], sale_price: null, stock_status: "in_stock" }
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
