-- Bloom 27권 cover_url 교체 (STEP26), 생성일 2026-06-29
-- 첫 페이지 본문 이미지 URL로 표지 교체. dry-run(bloom_cover_dryrun_50.csv) status=OK 확인분.

UPDATE books SET cover_url = 'https://s3.amazonaws.com/bloomharvest/okuukeremetbooks%40gmail.com%2f4e1a12a3-5bd4-415b-a697-a1fe7824ce1c%2fbloomdigital%2fCover.jpg'
WHERE source_platform = 'bloom' AND source_id = '4e1a12a3-5bd4-415b-a697-a1fe7824ce1c';
UPDATE books SET cover_url = 'https://s3.amazonaws.com/bloomharvest/hendyasiu%40att.net%2fbf6fe85c-a533-4922-9492-afc63d992ce5%2fbloomdigital%2fCover2.jpg'
WHERE source_platform = 'bloom' AND source_id = 'bf6fe85c-a533-4922-9492-afc63d992ce5';
UPDATE books SET cover_url = 'https://s3.amazonaws.com/bloomharvest/okuukeremetbooks%40gmail.com%2f0a38c9cf-0606-4ad4-aefb-8a97c44d62d9%2fbloomdigital%2fSWPB_257-a-street-or-a-zoo_Page_01_Image_0001.jpg'
WHERE source_platform = 'bloom' AND source_id = '0a38c9cf-0606-4ad4-aefb-8a97c44d62d9';
UPDATE books SET cover_url = 'https://s3.amazonaws.com/bloomharvest/okuukeremetbooks%40gmail.com%2f7ee7b9b7-eb02-4bd4-8633-652cf2f4ee77%2fbloomdigital%2fASP_98_a_very_tall_man_Page_01_Image_0001.png'
WHERE source_platform = 'bloom' AND source_id = '7ee7b9b7-eb02-4bd4-8633-652cf2f4ee77';
UPDATE books SET cover_url = 'https://s3.amazonaws.com/bloomharvest/efl-mediaeditor_png%40sil.org%2f64449775-1d4d-4852-b023-9c47bc51acc6%2fbloomdigital%2fASP_41_coloursofarainbow_Page_01_Image_0001.jpg'
WHERE source_platform = 'bloom' AND source_id = '64449775-1d4d-4852-b023-9c47bc51acc6';
UPDATE books SET cover_url = 'https://s3.amazonaws.com/bloomharvest/hannah_hudson%40sil-lead.org%2f411f6dd4-ade3-4c44-b443-0cf3646ba3bb%2fbloomdigital%2fwheelchair%2021.png'
WHERE source_platform = 'bloom' AND source_id = '411f6dd4-ade3-4c44-b443-0cf3646ba3bb';
UPDATE books SET cover_url = 'https://s3.amazonaws.com/bloomharvest/bethann_carlson%40sil.org%2f71d66196-ee12-4a24-9b86-ee76bbfe88f5%2fbloomdigital%2fSWPB_146-can-and-can-t_Page_01_Image_0001.png'
WHERE source_platform = 'bloom' AND source_id = '71d66196-ee12-4a24-9b86-ee76bbfe88f5';
UPDATE books SET cover_url = 'https://s3.amazonaws.com/bloomharvest/5qSVBXb0Hn%2f1767768466822%2fbloomdigital%2fSWPB_333-didi-s-knowledge_Page_01_Image_0001.png'
WHERE source_platform = 'bloom' AND source_id = '7f4681dc-4106-4736-a10e-8516b242ec82';
UPDATE books SET cover_url = 'https://s3.amazonaws.com/bloomharvest/3CAbXV6Vr7%2f1765465792648%2fbloomdigital%2fPicture1.jpg'
WHERE source_platform = 'bloom' AND source_id = 'b1be87dc-4c39-4c6d-bddd-5a1f8876a4dd';
UPDATE books SET cover_url = 'https://s3.amazonaws.com/bloomharvest/7GSFcsZ839%2f1740050294098%2fbloomdigital%2fIFEEL_AAA.jpg'
WHERE source_platform = 'bloom' AND source_id = 'c82262e3-4cc0-4346-8359-5de22b43827f';
UPDATE books SET cover_url = 'https://s3.amazonaws.com/bloomharvest/lucy.vitaliti%40montgomerycollege.edu%2f68808917-4849-43a2-823a-f6281e03b9d8%2fbloomdigital%2fAOR_boy-12.png'
WHERE source_platform = 'bloom' AND source_id = '68808917-4849-43a2-823a-f6281e03b9d8';
UPDATE books SET cover_url = 'https://s3.amazonaws.com/bloomharvest/hello%40luckydesign.ie%2fb30b0142-c791-4a52-9a5e-a4d4e4f4bf2a%2fbloomdigital%2fCover.jpg'
WHERE source_platform = 'bloom' AND source_id = 'b30b0142-c791-4a52-9a5e-a4d4e4f4bf2a';
UPDATE books SET cover_url = 'https://s3.amazonaws.com/bloomharvest/1a4tDc16sX%2f1782367773036%2fbloomdigital%2fASP_124_lets_go_0_Page_01_Image_0001.jpg'
WHERE source_platform = 'bloom' AND source_id = '6f7c4247-7d8d-4e91-b0fb-24c822607e43';
UPDATE books SET cover_url = 'https://s3.amazonaws.com/bloomharvest/bep_langhout%40sil.org%2fe67a8023-b942-474a-8094-a355d831f3fc%2fbloomdigital%2fASP_252_Little_and_big_Page_01_Image_0001.png'
WHERE source_platform = 'bloom' AND source_id = 'e67a8023-b942-474a-8094-a355d831f3fc';
UPDATE books SET cover_url = 'https://s3.amazonaws.com/bloomharvest/4gE0OOVJUe%2f1763048552625%2fbloomdigital%2fFamily%20cover.jpg'
WHERE source_platform = 'bloom' AND source_id = '468f071b-8251-4554-9e6f-21bfd9c5e57d';
UPDATE books SET cover_url = 'https://s3.amazonaws.com/bloomharvest/bethann_carlson%40sil.org%2f05bdb04b-3f95-4e7f-9332-f5444a7fca1a%2fbloomdigital%2fASP_303_Nakehi_and_the_Beans_Page_01_Image_0001.png'
WHERE source_platform = 'bloom' AND source_id = '05bdb04b-3f95-4e7f-9332-f5444a7fca1a';
UPDATE books SET cover_url = 'https://s3.amazonaws.com/bloomharvest/bethann_carlson%40sil.org%2f19b38c09-b63b-4e97-aa3e-e4834056ae8f%2fbloomdigital%2fThe%20Moon%20and%20The%20Cap_Cover.jpg'
WHERE source_platform = 'bloom' AND source_id = '19b38c09-b63b-4e97-aa3e-e4834056ae8f';
UPDATE books SET cover_url = 'https://s3.amazonaws.com/bloomharvest/7YWHmKnmy5%2f1780245121490%2fbloomdigital%2fimage.jpg'
WHERE source_platform = 'bloom' AND source_id = 'cf425be1-d87e-45f8-87af-963cad54e218';
UPDATE books SET cover_url = 'https://s3.amazonaws.com/bloomharvest/intern%40littlezebrabooks.com%2f6c2a2c2f-e0d9-4ce8-85c9-2962ddb2584d%2fbloomdigital%2fWidow%20Cover.png'
WHERE source_platform = 'bloom' AND source_id = '6c2a2c2f-e0d9-4ce8-85c9-2962ddb2584d';
UPDATE books SET cover_url = 'https://s3.amazonaws.com/bloomharvest/lohorungkushal%40gmail.com%2f985f9b3a-bd32-4eaa-938a-a47c694c1ad7%2fbloomdigital%2fimage1.jpg'
WHERE source_platform = 'bloom' AND source_id = '985f9b3a-bd32-4eaa-938a-a47c694c1ad7';
UPDATE books SET cover_url = 'https://s3.amazonaws.com/bloomharvest/bethann_carlson%40sil.org%2f6e57e9aa-063f-463d-ad3a-9df3e6e31da7%2fbloomdigital%2fASP_291_Things_we_can_do_Page_01_Image_0001.png'
WHERE source_platform = 'bloom' AND source_id = '6e57e9aa-063f-463d-ad3a-9df3e6e31da7';
UPDATE books SET cover_url = 'https://s3.amazonaws.com/bloomharvest/librarian%40bloomlibrary.org%2fed9782f9-e3cd-483b-8217-9b86d2430c76%2fbloomdigital%2fSWPB_308-timmi-s-dream_Page_01_Image_0001.png'
WHERE source_platform = 'bloom' AND source_id = 'ed9782f9-e3cd-483b-8217-9b86d2430c76';
UPDATE books SET cover_url = 'https://s3.amazonaws.com/bloomharvest/okuukeremetbooks%40gmail.com%2f25ce9a8d-58d0-4577-838e-46fa897822ae%2fbloomdigital%2f411-girl-and-pet-dog.jpg'
WHERE source_platform = 'bloom' AND source_id = '25ce9a8d-58d0-4577-838e-46fa897822ae';
UPDATE books SET cover_url = 'https://s3.amazonaws.com/bloomharvest/marian_hagg%40sil.org%2f50a63a0a-6a95-4ea0-bd43-f6d1ba27457b%2fbloomdigital%2fASP_40-Tortoise_finds_his_house_Page_01_Image_2.png'
WHERE source_platform = 'bloom' AND source_id = '50a63a0a-6a95-4ea0-bd43-f6d1ba27457b';
UPDATE books SET cover_url = 'https://s3.amazonaws.com/bloomharvest/bilatesther3%40gmail.com%2fb0f2a9ab-2326-4686-aa36-f8d57c859345%2fbloomdigital%2fset2a%20%28Large%291.jpg'
WHERE source_platform = 'bloom' AND source_id = 'b0f2a9ab-2326-4686-aa36-f8d57c859345';
UPDATE books SET cover_url = 'https://s3.amazonaws.com/bloomharvest/erica_sorena%40sil.org%2f409a37a2-27aa-4bae-8421-8aafeab23bf6%2fbloomdigital%2fWhere%20cover.jpg'
WHERE source_platform = 'bloom' AND source_id = '409a37a2-27aa-4bae-8421-8aafeab23bf6';
UPDATE books SET cover_url = 'https://s3.amazonaws.com/bloomharvest/lumimaftei%40gmail.com%2f1daac76a-b353-459a-a9cc-a2f0f8c8abc8%2fbloomdigital%2fASP_100_where_is_my_bat_Page_01_Image_000111.jpg'
WHERE source_platform = 'bloom' AND source_id = '1daac76a-b353-459a-a9cc-a2f0f8c8abc8';

-- 확인용:
-- SELECT title, cover_url FROM books WHERE source_platform='bloom'
--        AND source_id IN (
--        '4e1a12a3-5bd4-415b-a697-a1fe7824ce1c',
--        'bf6fe85c-a533-4922-9492-afc63d992ce5',
--        '0a38c9cf-0606-4ad4-aefb-8a97c44d62d9',
--        '7ee7b9b7-eb02-4bd4-8633-652cf2f4ee77',
--        '64449775-1d4d-4852-b023-9c47bc51acc6',
--        '411f6dd4-ade3-4c44-b443-0cf3646ba3bb',
--        '71d66196-ee12-4a24-9b86-ee76bbfe88f5',
--        '7f4681dc-4106-4736-a10e-8516b242ec82',
--        'b1be87dc-4c39-4c6d-bddd-5a1f8876a4dd',
--        'c82262e3-4cc0-4346-8359-5de22b43827f',
--        '68808917-4849-43a2-823a-f6281e03b9d8',
--        'b30b0142-c791-4a52-9a5e-a4d4e4f4bf2a',
--        '6f7c4247-7d8d-4e91-b0fb-24c822607e43',
--        'e67a8023-b942-474a-8094-a355d831f3fc',
--        '468f071b-8251-4554-9e6f-21bfd9c5e57d',
--        '05bdb04b-3f95-4e7f-9332-f5444a7fca1a',
--        '19b38c09-b63b-4e97-aa3e-e4834056ae8f',
--        'cf425be1-d87e-45f8-87af-963cad54e218',
--        '6c2a2c2f-e0d9-4ce8-85c9-2962ddb2584d',
--        '985f9b3a-bd32-4eaa-938a-a47c694c1ad7',
--        '6e57e9aa-063f-463d-ad3a-9df3e6e31da7',
--        'ed9782f9-e3cd-483b-8217-9b86d2430c76',
--        '25ce9a8d-58d0-4577-838e-46fa897822ae',
--        '50a63a0a-6a95-4ea0-bd43-f6d1ba27457b',
--        'b0f2a9ab-2326-4686-aa36-f8d57c859345',
--        '409a37a2-27aa-4bae-8421-8aafeab23bf6',
--        '1daac76a-b353-459a-a9cc-a2f0f8c8abc8'
--        ) ORDER BY title;
