# Review pencocokan nama barang

306 nama barang di file Excel dicocokkan ke 2.064 SKU master. **Impor belum dijalankan** —
baca daftar di bawah dan bilang mana yang salah.

| Status | Jumlah | Perlakuan |
|---|---|---|
| Cocok persis | 162 | Dipakai langsung |
| Mirip sangat tinggi (≥0.95) | 30 | Dipakai langsung |
| Mirip tinggi (0.85–0.95) | 31 | **Perlu dilihat** — ada yang beda ukuran/varian |
| Perlu diperiksa (<0.85) | 73 | **Perlu diputuskan** |
| Tidak ada padanan | 10 | Buat SKU baru, atau tunjuk SKU yang sudah ada |

Daftar lengkap 306 baris ada di `pencocokan-nama-barang.csv`.

Cara jawab: sebut nama barangnya lalu SKU/nama yang benar, atau bilang "buat baru",
atau "lewati" kalau memang tidak usah diimpor.

## Perlu diputuskan (kemiripan di bawah 0.85)

Beberapa jelas salah — contoh BAWANG MERAH dipasangkan ke Kacang Merah, LOBAK ke Salak, GARAM BATA ke Rambutan. Yang seperti ini butuh keputusanmu.

| Skor | Freq | Nama di file | UOM | Dicocokkan ke | UOM DB |
|---|---|---|---|---|---|
| 0.7 | 11x | PARSLEY BASAH | Kg | Parsley | Kg |
| 0.778 | 10x | KANTONG PLASTIK PUTIH SIZE 35 | Pack | Kantong Plastik Pex 30X57 | Pack |
| 0.833 | 7x | BAWANG MERAH | Kg | Kacang Merah | Kg |
| 0.667 | 6x | PETAI BESAR | Pcs | Tahu Putih Besar | Pcs |
| 0.769 | 6x | TELUR ASIN | Pcs | Telur Asin Bebek | Pcs |
| 0.8 | 5x | KACANG MEDE | Kg | Kacang Kedelai | Kg |
| 0.845 | 5x | COCA-COLA ORIGINAL @330ML ISI 24CAN | Ctn | Coca Cola Original Kaleng @330ML @24Can | Ctn |
| 0.7 | 5x | DAUN JERUK | Kg | Daun Katuk | Kg |
| 0.75 | 5x | OREGANO DRY | Kg | Oregano Fresh | Kg |
| 0.844 | 4x | MONIN SYRUP LECI @700ML | Btl | Monin Syrup Peach @720Ml | Btl |
| 0.824 | 4x | BERAS SETRA RAMOS - PREMIUM @5KG | Krg | Beras Sentra Ramos @5KG | Pack |
| 0.833 | 3x | TEPUNG DRAGONFLY @1KG | Pack | Tepung Terigu Dragon Fly @1Kg | Pack |
| 0.682 | 3x | MARGARINE AMANDA@200GR | Pack | Amanda Margarine @200Gr | Pack |
| 0.6 | 3x | LOBAK | Kg | Salak | Kg |
| 0.741 | 3x | KANTONG PLASTIK HITAM SIZE 35 | Pack | Kantong Plastik Pex 30X57 | Pack |
| 0.848 | 3x | KABOCHA ORANGE | Kg | Labu Kabocha Orange | Kg |
| 0.8 | 3x | KECAP INGGRIS @290ML LEA&PERRNIS W | Btl | Kecap Inggris Lea&Pernis W @290ML | Btl |
| 0.8 | 2x | LENGKOAS | Kg | Lengkio | Kg |
| 0.714 | 2x | KANTONG PLASTIK PUTIH UK 40 @500GR | Pack | Plastik Kantong Putih Ukuran 40 @500GR | Pack |
| 0.571 | 2x | SAGU TANI CAP PAK TANI @500GR | Pack | Gula Batu Putih @500GR | Pack |
| 0.818 | 2x | LADA HITAM BUBUK @250GR | Pack | Lada Hitam Halus @250Gr | Pack |
| 0.744 | 2x | SABUN CUCI MAMA LEMON @680ML | Pack | Mama Lemon @680Ml | Pack |
| 0.741 | 2x | KETUMBAR UTUH | Kg | Ketumbar Halus | Kg |
| 0.807 | 2x | SANREMO MACARONI ELBOW @500 GR | Pack | Sanremo Macaroni Pasta @500GR | Pack |
| 0.816 | 2x | DAGING GILING REGULAR | Kg | Daging Giling Reguler @1000GR | Pack |
| 0.667 | 2x | KANTONG PLASTIK BAWANG @1KG | Pack | Kantong Plastik Pex 30X57 | Pack |
| 0.8 | 2x | DAUN SELEDRI LOKAL | Kg | Daun Seledri | Kg |
| 0.688 | 2x | DANCOW BUBUK @1KG | Pack | Kunyit Bubuk @1Kg | Kg |
| 0.792 | 2x | SPRITE @330ML ISI 24CAN | Ctn | Sprite @250Ml Isi 24 Kaleng | Krat |
| 0.764 | 2x | TISSUE LIVI MULTIFOLD @150LBR | Pack | Tissue Livi Smart Multifold | Pack |
| 0.6 | 2x | JAMUR RED BOAT BRAND@425 GR | Can | Jagung Ayam Brand@425Gr | Can |
| 0.815 | 2x | DELMONTE SAUCE SAMBAL @5,5KG | Jrg | Delmonte Sauce Tomat @5,5KG | Jrg |
| 0.735 | 2x | COLLATA GLAZE DARK CHOCOLATTE@1KG | Pack | Colatta Dark Chocolate Compound @1KG | Pack |
| 0.788 | 2x | BERTOLLI BALSAMIC VINEGAR @500ML | Btl | Filipo Berio Balsamic Vinegar @250ML | Btl |
| 0.818 | 2x | ABC SIRUP LYCHEE @460ML | Btl | Sirup ABC Lychee @460ML | Btl |
| 0.744 | 1x | PLASTIK SEGITIGA | Kg | Plastik Segitiga (Piping Bag) | Pack |
| 0.815 | 1x | DELMONTE SAUCE SAMBAL @5.5KG | Jrg | Delmonte Sauce Tomat @5,5KG | Jrg |
| 0.731 | 1x | DELMONTE SAUCE SAMBAL @1KG | Pack | Delmonte Sauce Tomat @5,5KG | Jrg |
| 0.83 | 1x | SANREMO FETTUCINI PASTA @500GR | Pack | Sanremo Fettuccine @500Gr | Pack |
| 0.842 | 1x | SELEDRI STIK IMPORT | Kg | Celery Stick (Import) | Kg |
| 0.645 | 1x | SUSU MILO @990GR | Pack | Milo Bubuk@990Gr | Pack |
| 0.769 | 1x | SODA KUE KOEPOE @1KG | Kg | Soda Kue @1KG Koepoe2 | Pack |
| 0.833 | 1x | COCOA NIBS | Kg | Cocoa Nibs @1Kg | Pack |
| 0.667 | 1x | GARAM BATA | Pack | Rambutan | Kg |
| 0.744 | 1x | CIRENG BRECXELLE ISI 20 PCS | Pack | Cireng Brecxelle | Pack |
| 0.784 | 1x | KANTONG PLASTIK PE UK 6X20 | Pack | Kantong Plastik Pex 30X57 | Pack |
| 0.579 | 1x | SEMPIO GOCHUJANG@1KG | Pack | Kikkoman Gochujang | Btl |
| 0.591 | 1x | KEWPIE SAUS TARTAR@1KG | Pack | Kewpie Cheese Mayo @1KG | Pcs |
| 0.824 | 1x | TEPUNG ROTI PUTIH MAMASUKA @1KG | Pack | Tepung Roti Putih @1KG | Pack |
| 0.762 | 1x | SANTAN SUN KARA @1LITER | Pack | Santan Kara SUN @1ltr | Ltr |
| 0.762 | 1x | COCA-COLA ZERO @330ML ISI 24CAN | Ctn | Coca Cola Zero Kaleng @250ML @24Can | Ctn |
| 0.653 | 1x | MESES COKLAT TULIP @500 GR | Pack | Selai Coklat Curah @250Gr | Btl |
| 0.787 | 1x | BAKING PAPER LABAKER 10MX40CM | Pack | Baking Paper Best Fresh 10MX30CM | Pack |
| 0.839 | 1x | MADU URAY @875GR | Btl | Madu Uray @8750ML | Btl |
| 0.791 | 1x | HEINZ CUKA PUTIH @473ML | Btl | Heinz Cuka Putih @16OZ | Btl |
| 0.808 | 1x | SPRITE BOTOL @390ML ISI 12 PCS | Ctn | Sprite @250Ml Isi 12 Pcs | Krat |
| 0.696 | 1x | TEH CELUP POCI ISI 25 PCS | Pack | Teh Celup Sosro @50Pcs | Pack |
| 0.727 | 1x | SOSIS SAPI AKAI@1KG | Pack | Sosis Ayam @1KG | Pack |
| 0.788 | 1x | CUMI TUBE @1KG | Pack | Cumi Tube Frozen @1Kg | Pack |
| 0.724 | 1x | CUSTARD POWDER HERCULES@300 GR | Pack | Baking Powder Hercules @450GR | Can |
| 0.75 | 1x | KANTONG PLASTIK PE UK 15X30 (1KG) | Pack | Kantong Plastik Pex 30X57 | Pack |
| 0.724 | 1x | KANTONG PLASTIK PE UK 10X20 (1/4KG) | Pack | Kantong Plastik Pex 30X57 | Pack |
| 0.769 | 1x | PLASTIK ROLL UK 25X40 | Pack | Plastik Roll 30X45 | Pack |
| 0.731 | 1x | KANTONG PLASTIK PUTIH UK 17 | Pack | Kantong Plastik Pex 30X57 | Pack |
| 0.64 | 1x | PEPING BAG | Pack | Pisang Barangan | Sisir |
| 0.611 | 1x | MARSHMALLOW WHITE@1KG | Pack | Masako Sapi @1kg | Pack |
| 0.667 | 1x | COLLATA GLAZE WHITE CHOCOLATTE@1KG | Pack | Colatta White Chocolate Compound @250GR | Pack |
| 0.632 | 1x | GRATED  PARMESAN CHEESE PREMIUM@200GR | Pack | Rendang Premium @500GR | Pack |
| 0.762 | 1x | TAHU KUNING | Pcs | Ubi Kuning | Kg |
| 0.842 | 1x | DAUN KUCAI | Kg | Daun Kari | Kg |
| 0.833 | 1x | SELEDRI STIK LOKAL | Kg | Celery Stick (Lokal) | Kg |
| 0.636 | 1x | TOGE BIASA | Kg | Toge Bangkok | Kg |
| 0.656 | 1x | KIKKOMAN SAUCE TERIYAKI BAWANG@2,2 KG | Jrg | Kikkoman Garlic Teriyaki | Btl |

## Tidak ada padanan di master

Kalau memang barang baru, aku buatkan SKU baru dengan UOM sesuai file.

| Skor | Freq | Nama di file | UOM | Dicocokkan ke | UOM DB |
|---|---|---|---|---|---|
| 0.0 | 2x | KNORR TOMATO PRONTO SAUCE @2KG | Can | — |  |
| 0.0 | 2x | TATURA NEUFCHATEL CHEESE@2KG | Pack | — |  |
| 0.0 | 2x | COLLATA GLAZE TIRAMISU@1KG | Pack | — |  |
| 0.0 | 1x | PAPER PLATE | Pcs | — |  |
| 0.0 | 1x | BELIBIS SAUCE CABAI @5KG | Jrg | — |  |
| 0.0 | 1x | COLLATA GLAZE SPREAD GREEN TEA MATCHA @1KG | Pack | — |  |
| 0.0 | 1x | TES TORTILLA JAGUNG BBQ@ 2KG | Pack | — |  |
| 0.0 | 1x | RUM BUTTERFLY ESSENSE@60ML | Btl | — |  |
| 0.0 | 1x | LAPCHIONG AROMA MALIA SOSIS AYAM@1KG | Pack | — |  |
| 0.0 | 1x | SPONS | Kg | — |  |

## Mirip tinggi tapi patut dicek (0.85–0.95)

Risikonya beda ukuran atau varian, bukan beda barang. Contoh DIAMOND UHT MILK PLAIN @1LT dipasangkan ke Diamond Fresh Milk Plain @12Ltr — beda kemasan.

| Skor | Freq | Nama di file | UOM | Dicocokkan ke | UOM DB |
|---|---|---|---|---|---|
| 0.92 | 19x | KENTANG DIENG AL (1-4 PCS) | Kg | Kentang Dieng AL (1-4Pcs/KG) | Kg |
| 0.932 | 9x | DELMONTE CHILI EXTRA HOT SACHET @8GR @24 PCS | Pack | Delmonte Chilli Extra Hot Sachet @8Gr isi 24Pcs | Pack |
| 0.857 | 9x | DIAMOND UHT MILK PLAIN @1LT | Pack | Diamond Fresh Milk Plain @12Ltr | Ctn |
| 0.864 | 5x | NANGKA MENTAH SAYUR | Kg | Nangka Mentah Sayur Kupas | Kg |
| 0.895 | 4x | TEPUNG ROTI PUTIH | Kg | Tepung Roti Putih @1KG | Pack |
| 0.933 | 4x | UDANG VANAME KUPAS (ISI 91/120) @1KG NON COOKED | Pack | Udang Vaname Kupas (Isi 91/120) @500GR Non Cooked | Pack |
| 0.867 | 4x | SUSU EVAPORASI CARNATION @405GR | Can | Susu Evaporasi Carnation 380ML | Can |
| 0.9 | 4x | PARE HIJAU | Kg | Pear Hijau | Kg |
| 0.857 | 3x | SUNLIGHT @4.5LTR | Jrg | Sunlight @1.5L | Pack |
| 0.865 | 3x | CHILI FLAKES @ 1KG | Pack | Chili Flakes @1kg Jays | Pack |
| 0.87 | 3x | TAPAS SPONS | Pcs | Tapas Sponge | Pcs |
| 0.87 | 2x | BERAS ROJO LELE @20KG | Krg | Beras Lokal Rojo Lele @20Kg | Pack |
| 0.863 | 2x | EBI DAGING TANPA KULIT | Kg | Ebi Kering Daging Tanpa Kulit | Kg |
| 0.929 | 2x | BERTOLLI WHITE VINEGAR @500ML | Btl | Bertolli White Vinager @500ML | Btl |
| 0.877 | 2x | TUSUK BAMBU TEPOSUKI 10CM @100PCS | Pack | Tusuk Bambu Teposuki @10CM | Pack |
| 0.909 | 2x | FANTA MERAH @330ML ISI 24 CAN | Ctn | Fanta Merah @250ML Isi 24Can | Ctn |
| 0.943 | 2x | PLASTIK KANTONG PUTIH UK 50 @500GR | Pack | Plastik Kantong Putih Ukuran 50 @500GR | Pack |
| 0.923 | 1x | DELMONTE SAUCE TOMAT @1KG | Pack | Delmonte Sauce Tomat @5,5KG | Jrg |
| 0.886 | 1x | TISSUE PLENTY KITCHEN TOWEL ROLLS @2PCS | Pack | Tissue Plenty Kitchen Towel @2Rol | Pack |
| 0.87 | 1x | PLASTIK WRAPPING MAKANAN UK 30 CM | Roll | Plastik Wrapping Makanan 30CM x 30CM | Roll |
| 0.9 | 1x | KNORR DEMI GLACE @1KG | Pack | Knorr Demi Glass @1KG | Pack |
| 0.88 | 1x | TELUR PUYUH | Pcs | Telur Puyuh (KG) | Kg |
| 0.928 | 1x | PLASTIK WRAPPING MAKANAN UK 35X500CM | Roll | Plastik Wrapping Makanan 45x500CM | Roll |
| 0.923 | 1x | SASA TEPUNG SERBAGUNA @1KG | Pack | Sasa Tepung Serbaguna @210GR | Pack |
| 0.936 | 1x | KECAP MANIS BANGO 1500ML | Btl | Kecap Manis Bango @520ML | Pack |
| 0.943 | 1x | COLLATA DARK CHOCOLATE COUMPUND @1KG | Pack | Colatta Dark Chocolate Compound @1KG | Pack |
| 0.926 | 1x | PLASTIK KLIP 20X12 @100PCS | Pack | Plastik Klip 20x12 Isi 100PCS | Pack |
| 0.926 | 1x | PLASTIK KLIP 30X20 @100PCS | Pack | Plastik Klip 30x20 Isi 100PCS | Pack |
| 0.885 | 1x | TISSUE LIVI KOTAK @150 LBR | Pack | Tissue Livi Kotak @160Lembar | Pack |
| 0.914 | 1x | TYJ SPRING ROLL KULIT LUMPIA@20PCS | Pack | TYJ Spring Roll Kulit Lumpia @20Sheet | Pack |
| 0.875 | 1x | PAPRIKA POWDER | Kg | Paprika Powder @1Kg | Pack |
