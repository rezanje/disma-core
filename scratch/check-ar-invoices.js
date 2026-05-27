const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const profile = (process.env.NEXT_PUBLIC_SUPABASE_PROFILE || 'local').toLowerCase();
const suffix = profile === 'production' ? '_PRODUCTION' : '_LOCAL';
const dbUrl = process.env[`NEXT_PUBLIC_SUPABASE_URL${suffix}`] || process.env.NEXT_PUBLIC_SUPABASE_URL;
const dbKey = process.env[`SUPABASE_SERVICE_ROLE_KEY${suffix}`] || process.env.SUPABASE_SERVICE_ROLE_KEY;

const rawArText = `
 MS JACKSON ,5-Jan-2026,11-Jan-2026,14-Jan-2026,14-Feb-2026," Rp 995,000 ",,," Rp 995,000 "
 MS JACKSON ,12-Jan-2026,18-Jan-2026,21-Jan-2026,21-Feb-2026," Rp 5,331,100 ",,," Rp 5,331,100 "
 MS JACKSON ,19-Jan-2026,25-Jan-2026,29-Jan-2026,28-Feb-2026," Rp 3,383,500 ",,," Rp 3,383,500 "
 MITRA BOGA KREASI PRIMA ,26-Jan-2026,1-Feb-2026,3-Feb-2026,3-Mar-2026," Rp 4,000,000 ",26-Jan-2026," Rp 3,997,500 "," Rp 2,500 "
 HOLYCOW BY CHEF AFIT - CIJANTUNG ,26-Jan-2026,1-Feb-2026,3-Feb-2026,3-Mar-2026," Rp 9,582,500 ","2,13,17Mar'26"," Rp 9,492,500 "," Rp 90,000 "
 MS JACKSON ,26-Jan-2026,1-Feb-2026,3-Feb-2026,3-Mar-2026," Rp 3,737,050 ",,," Rp 3,737,050 "
 DEMIE BAKMIE BINTARO ,2-Feb-2026,8-Feb-2026,11-Feb-2026,11-Mar-2026," Rp 1,127,800 ",,," Rp 1,127,800 "
 DEMIE BAKMIE BLOK M ,2-Feb-2026,8-Feb-2026,11-Feb-2026,11-Mar-2026," Rp 1,314,600 ",,," Rp 1,314,600 "
 DEMIE BAKMIE CENTRAL KITCHEN ,2-Feb-2026,8-Feb-2026,11-Feb-2026,11-Mar-2026," Rp 36,732,050 ",,," Rp 36,732,050 "
 DEMIE BAKMIE CILANDAK ,2-Feb-2026,8-Feb-2026,11-Feb-2026,11-Mar-2026," Rp 1,700,050 ",,," Rp 1,700,050 "
 DEMIE BAKMIE KEMANG ,2-Feb-2026,8-Feb-2026,11-Feb-2026,11-Mar-2026," Rp 1,826,900 ",,," Rp 1,826,900 "
 DEMIE BAKMIE MARGONDA ,2-Feb-2026,8-Feb-2026,11-Feb-2026,11-Mar-2026," Rp 1,074,300 ",,," Rp 1,074,300 "
 DEMIE BAKMIE MENTENG ,2-Feb-2026,8-Feb-2026,11-Feb-2026,11-Mar-2026," Rp 3,289,200 ",,," Rp 3,289,200 "
 DEMIE BAKMIE SENOPATI ,2-Feb-2026,8-Feb-2026,11-Feb-2026,11-Mar-2026," Rp 1,715,200 ",,," Rp 1,715,200 "
 DEMIE BAKMIE TEBET ,2-Feb-2026,8-Feb-2026,11-Feb-2026,11-Mar-2026," Rp 2,048,950 ",,," Rp 2,048,950 "
 DEMIE BAKMIE BINTARO ,9-Feb-2026,15-Feb-2026,18-Feb-2026,18-Mar-2026," Rp 939,800 ",,," Rp 939,800 "
 DEMIE BAKMIE BLOK M ,9-Feb-2026,15-Feb-2026,18-Feb-2026,18-Mar-2026," Rp 1,229,500 ",,," Rp 1,229,500 "
 DEMIE BAKMIE CENTRAL KITCHEN ,9-Feb-2026,15-Feb-2026,18-Feb-2026,18-Mar-2026," Rp 16,069,640 ",,," Rp 16,069,640 "
 DEMIE BAKMIE CILANDAK ,9-Feb-2026,15-Feb-2026,18-Feb-2026,18-Mar-2026," Rp 1,907,150 ",,," Rp 1,907,150 "
 DEMIE BAKMIE KEMANG ,9-Feb-2026,15-Feb-2026,18-Feb-2026,18-Mar-2026," Rp 1,784,800 ",,," Rp 1,784,800 "
 DEMIE BAKMIE KATERING ,9-Feb-2026,15-Feb-2026,18-Feb-2026,18-Mar-2026," Rp 787,300 ",,," Rp 787,300 "
 DEMIE BAKMIE MARGONDA ,9-Feb-2026,15-Feb-2026,18-Feb-2026,18-Mar-2026," Rp 1,159,950 ",,," Rp 1,159,950 "
 DEMIE BAKMIE MENTENG ,9-Feb-2026,15-Feb-2026,18-Feb-2026,18-Mar-2026," Rp 2,576,400 ",,," Rp 2,576,400 "
 DEMIE BAKMIE SENOPATI ,9-Feb-2026,15-Feb-2026,18-Feb-2026,18-Mar-2026," Rp 1,426,900 ",,," Rp 1,426,900 "
 DEMIE BAKMIE STORE ,9-Feb-2026,15-Feb-2026,18-Feb-2026,18-Mar-2026," Rp 2,640,000 ",,," Rp 2,640,000 "
 DEMIE BAKMIE TEBET ,9-Feb-2026,15-Feb-2026,18-Feb-2026,18-Mar-2026," Rp 1,631,100 ",,," Rp 1,631,100 "
 FRESH BOX ,9-Feb-2026,15-Feb-2026,18-Feb-2026,18-Mar-2026," Rp 128,234,400 ","5,12,19Mei'26"," Rp 113,155,950 "," Rp 15,078,450 "
 PT MITRABOGA KREASI PRIMA ,9-Feb-2026,15-Feb-2026,10-Feb-2026,10-Mar-2026," Rp 2,000,000 ",10-Feb-2026," Rp 1,997,500 "," Rp 2,500 "
 DEMIE BAKMIE BINTARO ,16-Feb-2026,22-Feb-2026,26-Feb-2026,26-Mar-2026," Rp 1,214,050 ",,," Rp 1,214,050 "
 DEMIE BAKMIE BLOK M ,16-Feb-2026,22-Feb-2026,26-Feb-2026,26-Mar-2026," Rp 1,892,820 ",,," Rp 1,892,820 "
 DEMIE BAKMIE CENTRAL KITCHEN ,16-Feb-2026,22-Feb-2026,26-Feb-2026,26-Mar-2026," Rp 32,604,300 ",,," Rp 32,604,300 "
 DEMIE BAKMIE CILANDAK ,16-Feb-2026,22-Feb-2026,26-Feb-2026,26-Mar-2026," Rp 1,818,800 ",,," Rp 1,818,800 "
 DEMIE BAKMIE KEMANG ,16-Feb-2026,22-Feb-2026,26-Feb-2026,26-Mar-2026," Rp 3,077,170 ",,," Rp 3,077,170 "
 DEMIE BAKMIE MARGONDA ,16-Feb-2026,22-Feb-2026,26-Feb-2026,26-Mar-2026," Rp 1,180,700 ",,," Rp 1,180,700 "
 DEMIE BAKMIE MENTENG ,16-Feb-2026,22-Feb-2026,26-Feb-2026,26-Mar-2026," Rp 3,717,930 ",,," Rp 3,717,930 "
 DEMIE BAKMIE SENOPATI ,16-Feb-2026,22-Feb-2026,26-Feb-2026,26-Mar-2026," Rp 1,936,640 ",,," Rp 1,936,640 "
 DEMIE BAKMIE STORE ,16-Feb-2026,22-Feb-2026,26-Feb-2026,26-Mar-2026," Rp 2,340,000 ",,," Rp 2,340,000 "
 DEMIE BAKMIE TEBET ,16-Feb-2026,22-Feb-2026,26-Feb-2026,26-Mar-2026," Rp 2,370,360 ",,," Rp 2,370,360 "
 FRESH BOX ,16-Feb-2026,22-Feb-2026,26-Feb-2026,26-Mar-2026," Rp 139,004,950 ",,," Rp 139,004,950 "
 HOLYCOW BY CHEF AFIT - CITOS ,16-Feb-2026,22-Feb-2026,26-Feb-2026,26-Mar-2026," Rp 660,000 ",28-Mar-2026," Rp 620,000 "," Rp 40,000 "
 CENTRAL KITCHEN SEINDONESIA KIAT ANANDA ,23-Feb-2026,1-Mar-2026,5-Mar-2026,5-Apr-2026," Rp 140,357,400 ",1&27April'26 & 5Mei'26," Rp 140,359,480 ","-Rp 2,080 "
 DEMIE BAKMIE BINTARO ,23-Feb-2026,1-Mar-2026,5-Mar-2026,5-Apr-2026," Rp 1,319,690 ",,," Rp 1,319,690 "
 DEMIE BAKMIE BLOK M ,23-Feb-2026,1-Mar-2026,5-Mar-2026,5-Apr-2026," Rp 1,771,560 ",,," Rp 1,771,560 "
 DEMIE BAKMIE CENTRAL KITCHEN ,23-Feb-2026,1-Mar-2026,5-Mar-2026,5-Apr-2026," Rp 18,245,500 ",,," Rp 18,245,500 "
 DEMIE BAKMIE CILANDAK ,23-Feb-2026,1-Mar-2026,5-Mar-2026,5-Apr-2026," Rp 2,311,870 ",,," Rp 2,311,870 "
 DEMIE BAKMIE KATERING ,23-Feb-2026,1-Mar-2026,5-Mar-2026,5-Apr-2026," Rp 549,000 ",,," Rp 549,000 "
 DEMIE BAKMIE KEMANG ,23-Feb-2026,1-Mar-2026,5-Mar-2026,5-Apr-2026," Rp 2,053,160 ",,," Rp 2,053,160 "
 DEMIE BAKMIE MARGONDA ,23-Feb-2026,1-Mar-2026,5-Mar-2026,5-Apr-2026," Rp 1,593,700 ",,," Rp 1,593,700 "
 DEMIE BAKMIE MENTENG ,23-Feb-2026,1-Mar-2026,5-Mar-2026,5-Apr-2026," Rp 4,443,812 ",,," Rp 4,443,812 "
 DEMIE BAKMIE SENOPATI ,23-Feb-2026,1-Mar-2026,5-Mar-2026,5-Apr-2026," Rp 2,701,060 ",,," Rp 2,701,060 "
 DEMIE BAKMIE TEBET ,23-Feb-2026,1-Mar-2026,5-Mar-2026,5-Apr-2026," Rp 3,024,500 ",,," Rp 3,024,500 "
 VIETNAMESE PHO 24 NOODLE ,23-Feb-2026,1-Mar-2026,5-Mar-2026,5-Apr-2026," Rp 1,846,200 ",29-Mar-2026," Rp 100,000 "," Rp 1,746,200 "
 FRESH BOX ,23-Feb-2026,1-Mar-2026,5-Mar-2026,5-Apr-2026," Rp 40,601,000 ",,," Rp 40,601,000 "
 DEMIE BAKMIE BINTARO ,2-Mar-2026,8-Mar-2026,11-Mar-2026,11-Apr-2026," Rp 1,252,490 ",,," Rp 1,252,490 "
 DEMIE BAKMIE BLOK M ,2-Mar-2026,8-Mar-2026,11-Mar-2026,11-Apr-2026," Rp 1,674,380 ",,," Rp 1,674,380 "
 DEMIE BAKMIE CENTRAL KITCHEN ,2-Mar-2026,8-Mar-2026,11-Mar-2026,11-Apr-2026," Rp 14,709,400 ",,," Rp 14,709,400 "
 DEMIE BAKMIE CILANDAK ,2-Mar-2026,8-Mar-2026,11-Mar-2026,11-Apr-2026," Rp 2,317,160 ",,," Rp 2,317,160 "
 DEMIE BAKMIE KEMANG ,2-Mar-2026,8-Mar-2026,11-Mar-2026,11-Apr-2026," Rp 2,297,700 ",,," Rp 2,297,700 "
 DEMIE BAKMIE MARGONDA ,2-Mar-2026,8-Mar-2026,11-Mar-2026,11-Apr-2026," Rp 1,537,480 ",,," Rp 1,537,480 "
 DEMIE BAKMIE MENTENG ,2-Mar-2026,8-Mar-2026,11-Mar-2026,11-Apr-2026," Rp 3,689,600 ",,," Rp 3,689,600 "
 DEMIE BAKMIE SENOPATI ,2-Mar-2026,8-Mar-2026,11-Mar-2026,11-Apr-2026," Rp 1,995,620 ",,," Rp 1,995,620 "
 DEMIE BAKMIE TEBET ,2-Mar-2026,8-Mar-2026,11-Mar-2026,11-Apr-2026," Rp 2,213,020 ",,," Rp 2,213,020 "
 DEMIE BAKMIE KATERING ,2-Mar-2026,8-Mar-2026,11-Mar-2026,11-Apr-2026," Rp 335,000 ",,," Rp 335,000 "
 DEMIE BAKMIE BINTARO ,9-Mar-2026,15-Mar-2026,17-Mar-2026,17-Apr-2026," Rp 917,050 ",,," Rp 917,050 "
 DEMIE BAKMIE BLOK M ,9-Mar-2026,15-Mar-2026,17-Mar-2026,17-Apr-2026," Rp 1,153,400 ",,," Rp 1,153,400 "
 DEMIE BAKMIE CENTRAL KITCHEN ,9-Mar-2026,15-Mar-2026,17-Mar-2026,17-Apr-2026," Rp 7,896,450 ",,," Rp 7,896,450 "
 DEMIE BAKMIE CILANDAK ,9-Mar-2026,15-Mar-2026,17-Mar-2026,17-Apr-2026," Rp 1,492,260 ",,," Rp 1,492,260 "
 DEMIE CATERING ,9-Mar-2026,15-Mar-2026,17-Mar-2026,17-Apr-2026," Rp 220,000 ",,," Rp 220,000 "
 DEMIE BAKMIE KEMANG ,9-Mar-2026,15-Mar-2026,17-Mar-2026,17-Apr-2026," Rp 1,311,100 ",,," Rp 1,311,100 "
 DEMIE BAKMIE MARGONDA ,9-Mar-2026,15-Mar-2026,17-Mar-2026,17-Apr-2026," Rp 1,050,020 ",,," Rp 1,050,020 "
 DEMIE BAKMIE MENTENG ,9-Mar-2026,15-Mar-2026,17-Mar-2026,17-Apr-2026," Rp 2,686,800 ",,," Rp 2,686,800 "
 DEMIE BAKMIE SENOPATI ,9-Mar-2026,15-Mar-2026,17-Mar-2026,17-Apr-2026," Rp 1,226,760 ",,," Rp 1,226,760 "
 DEMIE BAKMIE TEBET ,9-Mar-2026,15-Mar-2026,17-Mar-2026,17-Apr-2026," Rp 2,136,120 ",,," Rp 2,136,120 "
 SLICED PIZZA CIBIS ,9-Mar-2026,15-Mar-2026,17-Mar-2026,17-Apr-2026," Rp 8,303,300 ",18-May-2026," Rp 6,214,050 "," Rp 2,089,250 "
 HOLYCOW BY CHEF AFIT - BEKASI ,16-Mar-2026,22-Mar-2026,27-Mar-2026,27-Apr-2026," Rp 7,598,000 ",,," Rp 7,598,000 "
 SLICED PIZZA CIBIS ,16-Mar-2026,22-Mar-2026,27-Mar-2026,27-Apr-2026," Rp 364,000 ",,," Rp 364,000 "
 ATSUMARU BAR ,23-Mar-2026,29-Mar-2026,1-Apr-2026,1-May-2026," Rp 414,000 ",,," Rp 414,000 "
 ATSUMARU IZAKAYA ,23-Mar-2026,29-Mar-2026,1-Apr-2026,1-May-2026," Rp 626,500 ",,," Rp 626,500 "
 DAILY BREAD EPICENTRUM ,23-Mar-2026,29-Mar-2026,1-Apr-2026,1-May-2026," Rp 1,076,550 ",,," Rp 1,076,550 "
 MEAT A MEAT STEAK ,23-Mar-2026,29-Mar-2026,1-Apr-2026,1-May-2026," Rp 960,000 ",1 & 6 Apr 2026," Rp 1,950,000 ","-Rp 990,000 "
 SLICED PIZZA CIBIS ,23-Mar-2026,29-Mar-2026,1-Apr-2026,1-May-2026," Rp 815,800 ",,," Rp 815,800 "
 BAKMIE TAAT ,30-Mar-2026,5-Apr-2026,8-Apr-2026,8-May-2026," Rp 562,500 ",,," Rp 562,500 "
 BAPAK ARCHIE ,30-Mar-2026,5-Apr-2026,8-Apr-2026,8-May-2026," Rp 3,213,500 ",,," Rp 3,213,500 "
 DAILY BREAD EPICENTRUM ,30-Mar-2026,5-Apr-2026,8-Apr-2026,8-May-2026," Rp 1,019,900 ",,," Rp 1,019,900 "
 DAILY BREAD TEBET ,30-Mar-2026,5-Apr-2026,8-Apr-2026,8-May-2026," Rp 610,750 ",,," Rp 610,750 "
 HOLYCOW BY CHEF AFIT - BEKASI ,30-Mar-2026,5-Apr-2026,8-Apr-2026,8-May-2026," Rp 6,331,000 ",,," Rp 6,331,000 "
 MOOKIE ,30-Mar-2026,5-Apr-2026,8-Apr-2026,8-May-2026," Rp 1,364,000 ",,," Rp 1,364,000 "
 SLICED PIZZA CIBIS ,30-Mar-2026,5-Apr-2026,8-Apr-2026,8-May-2026," Rp 3,108,000 ",,," Rp 3,108,000 "
 SLICED PIZZA SCBD ,30-Mar-2026,5-Apr-2026,8-Apr-2026,8-May-2026," Rp 1,246,500 ",,," Rp 1,246,500 "
 BAKMIE TAAT ,6-Apr-2026,12-Apr-2026,15-Apr-2026,15-May-2026," Rp 220,000 ",,," Rp 220,000 "
 DAILY BREAD EPICENTRUM ,6-Apr-2026,12-Apr-2026,15-Apr-2026,15-May-2026," Rp 1,383,350 ",,," Rp 1,383,350 "
 DAILY BREAD TEBET ,6-Apr-2026,12-Apr-2026,15-Apr-2026,15-May-2026," Rp 398,500 ",,," Rp 398,500 "
 HOLYCOW BY CHEF AFIT - BEKASI ,6-Apr-2026,12-Apr-2026,15-Apr-2026,15-May-2026," Rp 2,266,000 ",,," Rp 2,266,000 "
 KEDAI MIE TJAP 1000 TAHUN CK BINTARO ,6-Apr-2026,12-Apr-2026,15-Apr-2026,15-May-2026," Rp 3,117,000 ",20-May-2026," Rp 1,246,800 "," Rp 1,870,200 "
 SLICED PIZZA CIBIS ,6-Apr-2026,12-Apr-2026,15-Apr-2026,15-May-2026," Rp 1,378,750 ",,," Rp 1,378,750 "
 ATSUMARU IZAKAYA ,13-Apr-2026,19-Apr-2026,22-Apr-2026,22-May-2026," Rp 4,433,000 ",,," Rp 4,433,000 "
 BAKMIE TAAT ,13-Apr-2026,19-Apr-2026,22-Apr-2026,22-May-2026," Rp 178,250 ",,," Rp 178,250 "
 CENTRAL KITCHEN SEINDONESIA KIAT ANANDA ,13-Apr-2026,19-Apr-2026,22-Apr-2026,22-May-2026," Rp 27,750,000 ",,," Rp 27,750,000 "
 DAILY BREAD EPICENTRUM ,13-Apr-2026,19-Apr-2026,22-Apr-2026,22-May-2026," Rp 1,869,000 ",,," Rp 1,869,000 "
 HOLYCOW BY CHEF AFIT - BEKASI ,13-Apr-2026,19-Apr-2026,22-Apr-2026,22-May-2026," Rp 7,414,000 ",,," Rp 7,414,000 "
 HOLYCOW BY CHEF AFIT - KEBON JERUK ,13-Apr-2026,19-Apr-2026,22-Apr-2026,22-May-2026," Rp 1,660,000 ",,," Rp 1,660,000 "
 HOLYCOW BY CHEF AFIT - PIK ,13-Apr-2026,19-Apr-2026,22-Apr-2026,22-May-2026," Rp 270,000 ",,," Rp 270,000 "
 HOLYCOW BY CHEF AFIT - WOLTER ,13-Apr-2026,19-Apr-2026,22-Apr-2026,22-May-2026," Rp 708,000 ",,," Rp 708,000 "
 KEDAI MIE TJAP 1000 TAHUN CK BINTARO ,13-Apr-2026,19-Apr-2026,22-Apr-2026,22-May-2026," Rp 2,628,000 ",,," Rp 2,628,000 "
 KYO COFFEE ASTHA ,13-Apr-2026,19-Apr-2026,22-Apr-2026,22-May-2026," Rp 129,000 ",,," Rp 129,000 "
 KYO COFFEE JATIWARINGIN ,13-Apr-2026,19-Apr-2026,22-Apr-2026,22-May-2026," Rp 4,488,000 ",,," Rp 4,488,000 "
 MEAT A MEAT STEAK ,13-Apr-2026,19-Apr-2026,22-Apr-2026,22-May-2026," Rp 1,845,000 ",22-Apr-2026," Rp 855,000 "," Rp 990,000 "
 NARASA ,13-Apr-2026,19-Apr-2026,22-Apr-2026,22-May-2026," Rp 2,630,050 ",18-May-2026," Rp 1,402,250 "," Rp 1,227,800 "
 SLICED PIZZA CIBIS ,13-Apr-2026,19-Apr-2026,22-Apr-2026,22-May-2026," Rp 3,541,000 ",,," Rp 3,541,000 "
 BAKMIE TAAT ,20-Apr-2026,26-Apr-2026,29-Apr-2026,29-May-2026," Rp 212,500 ",,," Rp 212,500 "
 CENTRAL KITCHEN SEINDONESIA KIAT ANANDA ,20-Apr-2026,26-Apr-2026,29-Apr-2026,29-May-2026," Rp 145,320,000 ",,," Rp 145,320,000 "
 DAILY BREAD EPICENTRUM ,20-Apr-2026,26-Apr-2026,29-Apr-2026,29-May-2026," Rp 1,459,450 ",,," Rp 1,459,450 "
 DAILY BREAD TEBET ,20-Apr-2026,26-Apr-2026,29-Apr-2026,29-May-2026," Rp 444,250 ",,," Rp 444,250 "
 HOLYCOW BY CHEF AFIT - ALAM SUTERA ,20-Apr-2026,26-Apr-2026,29-Apr-2026,29-May-2026," Rp 1,328,500 ",,," Rp 1,328,500 "
 HOLYCOW BY CHEF AFIT - BATU TULIS ,20-Apr-2026,26-Apr-2026,29-Apr-2026,29-May-2026," Rp 520,000 ",,," Rp 520,000 "
 HOLYCOW BY CHEF AFIT - BINTARO ,20-Apr-2026,26-Apr-2026,29-Apr-2026,29-May-2026," Rp 390,000 ",,," Rp 390,000 "
 HOLYCOW BY CHEF AFIT - CIBUBUR ,20-Apr-2026,26-Apr-2026,29-Apr-2026,29-May-2026," Rp 480,000 ",,," Rp 480,000 "
 HOLYCOW BY CHEF AFIT - CITOS ,20-Apr-2026,26-Apr-2026,29-Apr-2026,29-May-2026," Rp 1,000,000 ",,," Rp 1,000,000 "
 HOLYCOW BY CHEF AFIT - GADING SERPONG ,20-Apr-2026,26-Apr-2026,29-Apr-2026,29-May-2026," Rp 260,000 ",,," Rp 260,000 "
 HOLYCOW BY CHEF AFIT - KALIBATA CITY ,20-Apr-2026,26-Apr-2026,29-Apr-2026,29-May-2026," Rp 130,000 ",,," Rp 130,000 "
 HOLYCOW BY CHEF AFIT - KALIMALANG ,20-Apr-2026,26-Apr-2026,29-Apr-2026,29-May-2026," Rp 747,000 ",,," Rp 747,000 "
 HOLYCOW BY CHEF AFIT - KEBON JERUK ,20-Apr-2026,26-Apr-2026,29-Apr-2026,29-May-2026," Rp 624,750 ",,," Rp 624,750 "
 HOLYCOW BY CHEF AFIT - KELAPA GADING ,20-Apr-2026,26-Apr-2026,29-Apr-2026,29-May-2026," Rp 130,000 ",,," Rp 130,000 "
 HOLYCOW BY CHEF AFIT - MAMPANG ,20-Apr-2026,26-Apr-2026,29-Apr-2026,29-May-2026," Rp 156,000 ",,," Rp 156,000 "
 HOLYCOW BY CHEF AFIT - WOLTER ,20-Apr-2026,26-Apr-2026,29-Apr-2026,29-May-2026," Rp 130,000 ",,," Rp 130,000 "
 HOLYCOW HERITAGE ARJUNA ,20-Apr-2026,26-Apr-2026,29-Apr-2026,29-May-2026," Rp 172,250 ",,," Rp 172,250 "
 KEDAI MIE TJAP 1000 TAHUN BINTARO ,20-Apr-2026,26-Apr-2026,29-Apr-2026,29-May-2026," Rp 288,500 ",,," Rp 288,500 "
 KEDAI MIE TJAP 1000 TAHUN SCBD ,20-Apr-2026,26-Apr-2026,29-Apr-2026,29-May-2026," Rp 553,500 ",,," Rp 553,500 "
 KEDAI MIE TJAP 1000 TAHUN Senopati ,20-Apr-2026,26-Apr-2026,29-Apr-2026,29-May-2026," Rp 477,000 ",,," Rp 477,000 "
 KYO COFFEE ASTHA ,20-Apr-2026,26-Apr-2026,29-Apr-2026,29-May-2026," Rp 66,000 ",,," Rp 66,000 "
 KYO COFFEE JATIWARINGIN ,20-Apr-2026,26-Apr-2026,29-Apr-2026,29-May-2026," Rp 2,155,000 ",,," Rp 2,155,000 "
 MEAT A MEAT STEAK ,20-Apr-2026,26-Apr-2026,29-Apr-2026,29-May-2026," Rp 2,318,400 ",29-Apr-2026," Rp 2,300,900 "," Rp 17,500 "
 MIDAZ SENAYAN GOLF  ,20-Apr-2026,26-Apr-2026,29-Apr-2026,29-May-2026," Rp 4,651,000 ",,," Rp 4,651,000 "
 NARASA ,20-Apr-2026,26-Apr-2026,29-Apr-2026,29-May-2026," Rp 957,500 ",,," Rp 957,500 "
 SLICED PIZZA CIBIS ,20-Apr-2026,26-Apr-2026,29-Apr-2026,29-May-2026," Rp 4,460,850 ",,," Rp 4,460,850 "
 THE HALAL GUYS SMB ,20-Apr-2026,26-Apr-2026,29-Apr-2026,29-May-2026," Rp 1,152,810 ",,," Rp 1,152,810 "
 PT MITRABOGA KREASI PRIMA ,27-Apr-2026,3-May-2026,29-Apr-2026,29-May-2026," Rp 3,800,000 ",28-Apr-2026," Rp 3,797,500 "," Rp 2,500 "
 BAKMIE TAAT ,27-Apr-2026,3-May-2026,6-May-2026,6-Jun-2026," Rp 203,750 ",,," Rp 203,750 "
 CENTRAL KITCHEN SEINDONESIA KIAT ANANDA ,27-Apr-2026,3-May-2026,6-May-2026,6-Jun-2026," Rp 187,365,000 ",,," Rp 187,365,000 "
 DAILY BREAD EPICENTRUM ,27-Apr-2026,3-May-2026,6-May-2026,6-Jun-2026," Rp 1,971,440 ",,," Rp 1,971,440 "
 HOLYCOW BY CHEF AFIT - ALAM SUTERA ,27-Apr-2026,3-May-2026,6-May-2026,6-Jun-2026," Rp 416,000 ",,," Rp 416,000 "
 HOLYCOW BY CHEF AFIT - BINTARO ,27-Apr-2026,3-May-2026,6-May-2026,6-Jun-2026," Rp 834,500 ",,," Rp 834,500 "
 HOLYCOW BY CHEF AFIT - CIBUBUR ,27-Apr-2026,3-May-2026,6-May-2026,6-Jun-2026," Rp 390,000 ",,," Rp 390,000 "
 HOLYCOW BY CHEF AFIT - CIJANTUNG ,27-Apr-2026,3-May-2026,6-May-2026,6-Jun-2026," Rp 874,000 ",,," Rp 874,000 "
 HOLYCOW BY CHEF AFIT - CITOS ,27-Apr-2026,3-May-2026,6-May-2026,6-Jun-2026," Rp 806,000 ",,," Rp 806,000 "
 HOLYCOW BY CHEF AFIT - GADING SERPONG ,27-Apr-2026,3-May-2026,6-May-2026,6-Jun-2026," Rp 260,000 ",,," Rp 260,000 "
 HOLYCOW BY CHEF AFIT - KALIBATA CITY ,27-Apr-2026,3-May-2026,6-May-2026,6-Jun-2026," Rp 162,000 ",,," Rp 162,000 "
 HOLYCOW BY CHEF AFIT - KALIMALANG ,27-Apr-2026,3-May-2026,6-May-2026,6-Jun-2026," Rp 1,026,000 ",,," Rp 1,026,000 "
 HOLYCOW BY CHEF AFIT - KEBON JERUK ,27-Apr-2026,3-May-2026,6-May-2026,6-Jun-2026," Rp 344,000 ",,," Rp 344,000 "
 HOLYCOW BY CHEF AFIT - KELAPA GADING ,27-Apr-2026,3-May-2026,6-May-2026,6-Jun-2026," Rp 390,000 ",,," Rp 390,000 "
 HOLYCOW BY CHEF AFIT - MAMPANG ,27-Apr-2026,3-May-2026,6-May-2026,6-Jun-2026," Rp 390,000 ",,," Rp 390,000 "
 HOLYCOW BY CHEF AFIT - WOLTER ,27-Apr-2026,3-May-2026,6-May-2026,6-Jun-2026," Rp 1,130,000 ",,," Rp 1,130,000 "
 HOLYCOW HERITAGE ARJUNA ,27-Apr-2026,3-May-2026,6-May-2026,6-Jun-2026," Rp 353,750 ",,," Rp 353,750 "
 HOLYCOW WAREHOUSE STORED ,27-Apr-2026,3-May-2026,6-May-2026,6-Jun-2026," Rp 91,000 ",,," Rp 91,000 "
 KEDAI MIE TJAP 1000 TAHUN BINTARO ,27-Apr-2026,3-May-2026,6-May-2026,6-Jun-2026," Rp 91,000 ",,," Rp 91,000 "
 KEDAI MIE TJAP 1000 TAHUN CK BINTARO ,27-Apr-2026,3-May-2026,6-May-2026,6-Jun-2026," Rp 1,703,400 ",,," Rp 1,703,400 "
 KEDAI MIE TJAP 1000 TAHUN SCBD ,27-Apr-2026,3-May-2026,6-May-2026,6-Jun-2026," Rp 719,000 ",,," Rp 719,000 "
 KEDAI MIE TJAP 1000 TAHUN Senopati ,27-Apr-2026,3-May-2026,6-May-2026,6-Jun-2026," Rp 196,000 ",,," Rp 196,000 "
 KENARA CATERING ,27-Apr-2026,3-May-2026,6-May-2026,6-Jun-2026," Rp 1,770,750 ",,," Rp 1,770,750 "
 KYO COFFEE ASTHA ,27-Apr-2026,3-May-2026,6-May-2026,6-Jun-2026," Rp 42,000 ",,," Rp 42,000 "
 KYO COFFEE JATIWARINGIN ,27-Apr-2026,3-May-2026,6-May-2026,6-Jun-2026," Rp 4,130,000 ",,," Rp 4,130,000 "
 NARASA ,27-Apr-2026,3-May-2026,6-May-2026,6-Jun-2026," Rp 1,108,500 ",,," Rp 1,108,500 "
 SLICED PIZZA CIBIS ,27-Apr-2026,3-May-2026,6-May-2026,6-Jun-2026," Rp 3,735,500 ",,," Rp 3,735,500 "
 VIETNAMESE PHO 24 NOODLE ,27-Apr-2026,3-May-2026,6-May-2026,6-Jun-2026," Rp 1,702,000 ",,," Rp 1,702,000 "
 BAKMIE TAAT ,4-May-2026,10-May-2026,13-May-2026,13-Jun-2026," Rp 157,000 ",,," Rp 157,000 "
 CENTRAL KITCHEN SEINDONESIA KIAT ANANDA ,4-May-2026,10-May-2026,13-May-2026,13-Jun-2026," Rp 69,975,000 ",,," Rp 69,975,000 "
 DAILY BREAD EPICENTRUM ,4-May-2026,10-May-2026,13-May-2026,13-Jun-2026," Rp 1,337,950 ",,," Rp 1,337,950 "
 HOLYCOW BY CHEF AFIT - ALAM SUTERA ,4-May-2026,10-May-2026,13-May-2026,13-Jun-2026," Rp 375,000 ",,," Rp 375,000 "
 HOLYCOW BY CHEF AFIT - BINTARO ,4-May-2026,10-May-2026,13-May-2026,13-Jun-2026," Rp 250,000 ",,," Rp 250,000 "
 HOLYCOW BY CHEF AFIT - CIBUBUR ,4-May-2026,10-May-2026,13-May-2026,13-Jun-2026," Rp 493,000 ",,," Rp 493,000 "
 HOLYCOW BY CHEF AFIT - CIJANTUNG ,4-May-2026,10-May-2026,13-May-2026,13-Jun-2026," Rp 332,000 ",,," Rp 332,000 "
 HOLYCOW BY CHEF AFIT - CITOS ,4-May-2026,10-May-2026,13-May-2026,13-Jun-2026," Rp 1,309,500 ",,," Rp 1,309,500 "
 HOLYCOW BY CHEF AFIT - GADING SERPONG ,4-May-2026,10-May-2026,13-May-2026,13-Jun-2026," Rp 645,000 ",,," Rp 645,000 "
 HOLYCOW BY CHEF AFIT - KALIBATA CITY ,4-May-2026,10-May-2026,13-May-2026,13-Jun-2026," Rp 466,500 ",,," Rp 466,500 "
 HOLYCOW BY CHEF AFIT - KALIMALANG ,4-May-2026,10-May-2026,13-May-2026,13-Jun-2026," Rp 250,000 ",,," Rp 250,000 "
 HOLYCOW BY CHEF AFIT - KEBON JERUK ,4-May-2026,10-May-2026,13-May-2026,13-Jun-2026," Rp 427,000 ",,," Rp 427,000 "
 HOLYCOW BY CHEF AFIT - KELAPA GADING ,4-May-2026,10-May-2026,13-May-2026,13-Jun-2026," Rp 1,222,500 ",,," Rp 1,222,500 "
 HOLYCOW BY CHEF AFIT - MAMPANG ,4-May-2026,10-May-2026,13-May-2026,13-Jun-2026," Rp 125,000 ",,," Rp 125,000 "
 HOLYCOW BY CHEF AFIT - PIK ,4-May-2026,10-May-2026,13-May-2026,13-Jun-2026," Rp 730,000 ",,," Rp 730,000 "
 HOLYCOW BY CHEF AFIT - WOLTER ,4-May-2026,10-May-2026,13-May-2026,13-Jun-2026," Rp 842,000 ",,," Rp 842,000 "
 HOLYCOW HERITAGE ARJUNA ,4-May-2026,10-May-2026,13-May-2026,13-Jun-2026," Rp 535,000 ",,," Rp 535,000 "
 JANKENDON ,4-May-2026,10-May-2026,13-May-2026,13-Jun-2026," Rp 397,500 ",,," Rp 397,500 "
 KEDAI MIE TJAP 1000 TAHUN BINTARO ,4-May-2026,10-May-2026,13-May-2026,13-Jun-2026," Rp 872,500 ",,," Rp 872,500 "
 KEDAI MIE TJAP 1000 TAHUN CK BINTARO ,4-May-2026,10-May-2026,13-May-2026,13-Jun-2026," Rp 2,112,200 ",,," Rp 2,112,200 "
 KEDAI MIE TJAP 1000 TAHUN SCBD ,4-May-2026,10-May-2026,13-May-2026,13-Jun-2026," Rp 1,807,000 ",,," Rp 1,807,000 "
 KEDAI MIE TJAP 1000 TAHUN Senopati ,4-May-2026,10-May-2026,13-May-2026,13-Jun-2026," Rp 248,500 ",,," Rp 248,500 "
 KYO COFFEE ASTHA ,4-May-2026,10-May-2026,13-May-2026,13-Jun-2026," Rp 210,000 ",,," Rp 210,000 "
 KYO COFFEE JATIWARINGIN ,4-May-2026,10-May-2026,13-May-2026,13-Jun-2026," Rp 3,260,000 ",,," Rp 3,260,000 "
 MIDAZ SENAYAN GOLF  ,4-May-2026,10-May-2026,13-May-2026,13-Jun-2026," Rp 7,686,000 ",,," Rp 7,686,000 "
 MOOKIE ,4-May-2026,10-May-2026,13-May-2026,13-Jun-2026," Rp 3,202,800 ",,," Rp 3,202,800 "
 PEPR BURGER UF CIPETE ,4-May-2026,10-May-2026,13-May-2026,13-Jun-2026," Rp 2,246,000 ",,," Rp 2,246,000 "
 SIMPANG RAYA ,4-May-2026,10-May-2026,13-May-2026,13-Jun-2026," Rp 4,107,000 ",,," Rp 4,107,000 "
 SLICED PIZZA BINTARO ,4-May-2026,10-May-2026,13-May-2026,13-Jun-2026," Rp 394,000 ",,," Rp 394,000 "
 SLICED PIZZA BLOK M ,4-May-2026,10-May-2026,13-May-2026,13-Jun-2026," Rp 3,024,300 ",,," Rp 3,024,300 "
 SLICED PIZZA CIBIS ,4-May-2026,10-May-2026,13-May-2026,13-Jun-2026," Rp 5,335,500 ",,," Rp 5,335,500 "
 SLICED PIZZA PONDOK PINANG ,4-May-2026,10-May-2026,13-May-2026,13-Jun-2026," Rp 810,100 ",,," Rp 810,100 "
 SLICED PIZZA SCBD ,4-May-2026,10-May-2026,13-May-2026,13-Jun-2026," Rp 835,700 ",,," Rp 835,700 "
 THE HALAL GUYS SMB ,4-May-2026,10-May-2026,13-May-2026,13-Jun-2026," Rp 1,706,455 ",,," Rp 1,706,455 "
 VIETNAMESE PHO 24 NOODLE ,4-May-2026,10-May-2026,13-May-2026,13-Jun-2026," Rp 2,845,000 ",,," Rp 2,845,000 "
 BAKMIE TAAT ,11-May-2026,17-May-2026,20-May-2026,20-Jun-2026," Rp 235,450 ",,," Rp 235,450 "
 CENTRAL KITCHEN SEINDONESIA KIAT ANANDA ,11-May-2026,17-May-2026,20-May-2026,20-Jun-2026," Rp 40,090,000 ",,," Rp 40,090,000 "
 DAILY BREAD EPICENTRUM ,11-May-2026,17-May-2026,20-May-2026,20-Jun-2026," Rp 1,836,156 ",,," Rp 1,836,156 "
 HOLYCOW BY CHEF AFIT - ALAM SUTERA ,11-May-2026,17-May-2026,20-May-2026,20-Jun-2026," Rp 460,500 ",,," Rp 460,500 "
 HOLYCOW BY CHEF AFIT - BATU TULIS ,11-May-2026,17-May-2026,20-May-2026,20-Jun-2026," Rp 756,000 ",,," Rp 756,000 "
 HOLYCOW BY CHEF AFIT - BINTARO ,11-May-2026,17-May-2026,20-May-2026,20-Jun-2026," Rp 629,500 ",,," Rp 629,500 "
 HOLYCOW BY CHEF AFIT - CIBUBUR ,11-May-2026,17-May-2026,20-May-2026,20-Jun-2026," Rp 150,000 ",,," Rp 150,000 "
 HOLYCOW BY CHEF AFIT - CITOS ,11-May-2026,17-May-2026,20-May-2026,20-Jun-2026," Rp 276,000 ",,," Rp 276,000 "
 HOLYCOW BY CHEF AFIT - FOODTRUCK ,11-May-2026,17-May-2026,20-May-2026,20-Jun-2026," Rp 125,000 ",,," Rp 125,000 "
 HOLYCOW BY CHEF AFIT - GADING SERPONG ,11-May-2026,17-May-2026,20-May-2026,20-Jun-2026," Rp 429,000 ",,," Rp 429,000 "
 HOLYCOW BY CHEF AFIT - KALIBATA CITY ,11-May-2026,17-May-2026,20-May-2026,20-Jun-2026," Rp 150,000 ",,," Rp 150,000 "
 HOLYCOW BY CHEF AFIT - KALIMALANG ,11-May-2026,17-May-2026,20-May-2026,20-Jun-2026," Rp 807,500 ",,," Rp 807,500 "
 HOLYCOW BY CHEF AFIT - KEBON JERUK ,11-May-2026,17-May-2026,20-May-2026,20-Jun-2026," Rp 653,000 ",,," Rp 653,000 "
 HOLYCOW BY CHEF AFIT - KELAPA GADING ,11-May-2026,17-May-2026,20-May-2026,20-Jun-2026," Rp 290,000 ",,," Rp 290,000 "
 HOLYCOW BY CHEF AFIT - MAMPANG ,11-May-2026,17-May-2026,20-May-2026,20-Jun-2026," Rp 385,000 ",,," Rp 385,000 "
 HOLYCOW BY CHEF AFIT - PIK ,11-May-2026,17-May-2026,20-May-2026,20-Jun-2026," Rp 330,000 ",,," Rp 330,000 "
 HOLYCOW BY CHEF AFIT - WOLTER ,11-May-2026,17-May-2026,20-May-2026,20-Jun-2026," Rp 315,000 ",,," Rp 315,000 "
 HOLYCOW HERITAGE ARJUNA ,11-May-2026,17-May-2026,20-May-2026,20-Jun-2026," Rp 276,500 ",,," Rp 276,500 "
 KEDAI MIE TJAP 1000 TAHUN BINTARO ,11-May-2026,17-May-2026,20-May-2026,20-Jun-2026," Rp 387,500 ",,," Rp 387,500 "
 KEDAI MIE TJAP 1000 TAHUN CK BINTARO ,11-May-2026,17-May-2026,20-May-2026,20-Jun-2026," Rp 1,036,000 ",,," Rp 1,036,000 "
 KEDAI MIE TJAP 1000 TAHUN SCBD ,11-May-2026,17-May-2026,20-May-2026,20-Jun-2026," Rp 1,271,000 ",,," Rp 1,271,000 "
 KEDAI MIE TJAP 1000 TAHUN Senopati ,11-May-2026,17-May-2026,20-May-2026,20-Jun-2026," Rp 247,500 ",,," Rp 247,500 "
 KYO COFFEE JATIWARINGIN ,11-May-2026,17-May-2026,20-May-2026,20-Jun-2026," Rp 3,581,500 ",,," Rp 3,581,500 "
 MIDAZ SENAYAN GOLF  ,11-May-2026,17-May-2026,20-May-2026,20-Jun-2026," Rp 1,610,000 ",,," Rp 1,610,000 "
 MOOKIE ,11-May-2026,17-May-2026,20-May-2026,20-Jun-2026," Rp 2,900,500 ",,," Rp 2,900,500 "
 NARASA ,11-May-2026,17-May-2026,20-May-2026,20-Jun-2026," Rp 1,403,000 ",,," Rp 1,403,000 "
 PEPR BURGER SENAYAN ,11-May-2026,17-May-2026,20-May-2026,20-Jun-2026," Rp 2,626,000 ",,," Rp 2,626,000 "
 PEPR BURGER UF CIPETE ,11-May-2026,17-May-2026,20-May-2026,20-Jun-2026," Rp 2,506,000 ",,," Rp 2,506,000 "
 RIVARENO PLAZA SENAYAN ,11-May-2026,17-May-2026,20-May-2026,20-Jun-2026," Rp 971,000 ",,," Rp 971,000 "
 RIVARENO URBAN FOREST CIPETE ,11-May-2026,17-May-2026,20-May-2026,20-Jun-2026," Rp 635,000 ",,," Rp 635,000 "
 SHOTS COFFEE ,11-May-2026,17-May-2026,20-May-2026,20-Jun-2026," Rp 15,261,000 ",,," Rp 15,261,000 "
 SIMPANG RAYA ,11-May-2026,17-May-2026,20-May-2026,20-Jun-2026," Rp 4,632,000 ",,," Rp 4,632,000 "
 SLICED PIZZA BINTARO ,11-May-2026,17-May-2026,20-May-2026,20-Jun-2026," Rp 1,541,600 ",,," Rp 1,541,600 "
 SLICED PIZZA BLOK M ,11-May-2026,17-May-2026,20-May-2026,20-Jun-2026," Rp 2,089,500 ",,," Rp 2,089,500 "
 SLICED PIZZA CIBIS ,11-May-2026,17-May-2026,20-May-2026,20-Jun-2026," Rp 5,096,100 ",,," Rp 5,096,100 "
 SLICED PIZZA PONDOK PINANG ,11-May-2026,17-May-2026,20-May-2026,20-Jun-2026," Rp 381,600 ",,," Rp 381,600 "
 SLICED PIZZA SCBD ,11-May-2026,17-May-2026,20-May-2026,20-Jun-2026," Rp 312,000 ",,," Rp 312,000 "
 THE HALAL GUYS SMB ,11-May-2026,17-May-2026,20-May-2026,20-Jun-2026," Rp 1,503,060 ",,," Rp 1,503,060 "
 VIETNAMESE PHO 24 NOODLE ,11-May-2026,17-May-2026,20-May-2026,20-Jun-2026," Rp 8,846,000 ",,," Rp 8,846,000 "
 KUALINARI CATERING ,11-May-2026,17-May-2026,20-May-2026,20-Jun-2026," Rp 1,730,000 ",,," Rp 1,730,000 "
 PT MITRA BOGA KREASI PRIMA ,18-May-2026,24-May-2026,19-May-2026,19-Jun-2026," Rp 3,400,000 ",19-May-2026," Rp 3,397,500 "," Rp 2,500 "
`;

// Parse single date exactly like import-piutang.js does
function parseSingleDate(str) {
  if (!str) return null;
  let cleaned = str.replace(/-/g, ' ').trim();
  const match = cleaned.match(/^(\d{1,2})\s*([A-Za-z]+)\s*['\s]*(\d{2,4})$/);
  if (!match) return null;
  const day = match[1].padStart(2, '0');
  const monthStr = match[2].toLowerCase();
  const yearStr = match[3];
  const year = yearStr.length === 2 ? `20${yearStr}` : yearStr;
  
  const months = {
    jan: '01', feb: '02', mar: '03', apr: '04', april: '04',
    mei: '05', may: '05', jun: '06', june: '06', jul: '07', july: '07',
    aug: '08', agu: '08', agust: '08', sep: '09', sept: '09',
    oct: '10', okt: '10', nov: '11', des: '12', dec: '12'
  };
  const month = months[monthStr];
  if (!month) return null;
  return `${year}-${month}-${day}T00:00:00.000Z`;
}

function parseAmount(str) {
  if (!str) return 0;
  const cleaned = str.replace(/Rp/gi, '').replace(/\s/g, '').replace(/,/g, '');
  if (!cleaned) return 0;
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

async function main() {
  const supabase = createClient(dbUrl, dbKey);
  console.log(`Checking DB on profile: ${profile}`);

  // Fetch clients
  const { data: dbClients, error: clientErr } = await supabase
    .from('clients')
    .select('id, company_name');

  if (clientErr) {
    console.error('Error fetching clients:', clientErr);
    return;
  }

  const clientMap = new Map();
  dbClients.forEach(c => {
    clientMap.set(c.company_name.trim().toUpperCase(), c);
  });

  // Fetch invoices
  const { data: dbInvoices, error: invErr } = await supabase
    .from('invoices')
    .select('*');

  if (invErr) {
    console.error('Error fetching invoices:', invErr);
    return;
  }

  // Parse raw text
  const lines = rawArText.split('\n');
  const userInvoices = [];
  let userTotalNominal = 0;
  let userTotalSisa = 0;

  lines.forEach((lineStr, lineIdx) => {
    const line = lineStr.trim();
    if (!line) return;
    const cols = parseCSVLine(line);
    if (cols.length < 9) return;

    const outletName = cols[0].trim();
    if (!outletName || outletName === 'Nama Outlet') return;

    const orderStartStr = cols[1];
    const orderEndStr = cols[2];
    const issueDateStr = cols[3];
    const dueDateStr = cols[4];
    const nominalStr = cols[5];
    const payDateStr = cols[6];
    const paidStr = cols[7];
    const sisaStr = cols[8];

    const nominal = parseAmount(nominalStr);
    const paid = parseAmount(paidStr);
    const sisa = parseAmount(sisaStr);

    userTotalNominal += nominal;
    userTotalSisa += sisa;

    userInvoices.push({
      lineIdx: lineIdx + 1,
      outletName,
      issueDateStr,
      dueDateStr,
      nominal,
      paid,
      sisa,
      issueDateIso: parseSingleDate(issueDateStr),
      dueDateIso: parseSingleDate(dueDateStr),
      rawLine: line
    });
  });

  console.log(`Parsed ${userInvoices.length} invoices from user text.`);
  console.log(`User Total Nominal: ${userTotalNominal}`);
  console.log(`User Total Sisa Tagihan: ${userTotalSisa}`);
  console.log(`Total DB Invoices: ${dbInvoices.length}`);

  let mismatchesCount = 0;
  let matchesCount = 0;

  // We will match user invoices with database invoices.
  // To avoid matching the same DB invoice multiple times, we'll keep track of matched DB invoice IDs.
  const matchedDbIds = new Set();

  userInvoices.forEach(userInv => {
    const upperOutlet = userInv.outletName.toUpperCase();
    const dbClient = clientMap.get(upperOutlet);

    if (!dbClient) {
      console.log(`❌ Client not found in DB: "${userInv.outletName}"`);
      mismatchesCount++;
      return;
    }

    // Try to find the exact database invoice for this client
    // We match by client_id, total_amount, and due_date or issue_date.
    // Also we match where amount_paid matches, and remaining matches.
    const candidates = dbInvoices.filter(inv => {
      if (inv.client_id !== dbClient.id) return false;
      if (matchedDbIds.has(inv.id)) return false;

      // Exact amount match
      const amountMatches = Math.abs(inv.total_amount - userInv.nominal) < 2;
      
      // Date matches
      const dbIssueStr = new Date(inv.issue_date).toISOString().split('T')[0];
      const userIssueStr = userInv.issueDateIso ? userInv.issueDateIso.split('T')[0] : null;
      
      const dbDueStr = new Date(inv.due_date).toISOString().split('T')[0];
      const userDueStr = userInv.dueDateIso ? userInv.dueDateIso.split('T')[0] : null;

      const dateMatches = (dbIssueStr === userIssueStr) || (dbDueStr === userDueStr);

      return amountMatches && dateMatches;
    });

    if (candidates.length === 0) {
      console.log(`❌ Invoice NOT FOUND in DB: Client="${userInv.outletName}", IssueDate=${userInv.issueDateStr}, DueDate=${userInv.dueDateStr}, Nominal=${userInv.nominal}, Sisa=${userInv.sisa}`);
      mismatchesCount++;
      return;
    }

    // Best candidate
    const dbInv = candidates[0];
    matchedDbIds.add(dbInv.id);

    // Verify properties
    const paidMatches = Math.abs(dbInv.amount_paid - userInv.paid) < 2;
    const remainingMatches = Math.abs((dbInv.total_amount - dbInv.amount_paid) - userInv.sisa) < 2;

    if (!paidMatches || !remainingMatches) {
      console.log(`❌ Mismatch in invoice values for "${userInv.outletName}":`);
      console.log(`   User: Nominal=${userInv.nominal}, Paid=${userInv.paid}, Sisa=${userInv.sisa}`);
      console.log(`   DB  : ID=${dbInv.id}, Total=${dbInv.total_amount}, Paid=${dbInv.amount_paid}, Sisa=${dbInv.total_amount - dbInv.amount_paid}`);
      mismatchesCount++;
    } else {
      matchesCount++;
    }
  });

  console.log('\n--- AR VERIFICATION SUMMARY ---');
  console.log(`Total User Invoices Checked: ${userInvoices.length}`);
  console.log(`Successfully Matched Invoices: ${matchesCount}`);
  console.log(`Total Mismatches / Not Found: ${mismatchesCount}`);

  // Let's also check if there are any invoices in the DB that remain unmatched
  const unmatchedDbInvoices = dbInvoices.filter(inv => !matchedDbIds.has(inv.id));
  console.log(`Unmatched DB Invoices: ${unmatchedDbInvoices.length}`);
  
  if (unmatchedDbInvoices.length > 0 && unmatchedDbInvoices.length < 20) {
    console.log('Unmatched DB Invoices:');
    unmatchedDbInvoices.forEach(inv => {
      const client = dbClients.find(c => c.id === inv.client_id);
      console.log(`- ${client ? client.company_name : 'Unknown'}: ID=${inv.id}, Total=${inv.total_amount}, Sisa=${inv.total_amount - inv.amount_paid}`);
    });
  }
}

main();
