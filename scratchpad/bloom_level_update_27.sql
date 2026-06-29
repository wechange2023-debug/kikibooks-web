-- Bloom 27권 level 매핑 (STEP26, computedLevel 1:1), 생성일 2026-06-29
-- computedLevel:1 -> level 1, computedLevel:2 -> level 2. (3~5 없음)

UPDATE books SET level = 2
WHERE source_platform = 'bloom' AND source_id = '4e1a12a3-5bd4-415b-a697-a1fe7824ce1c';
UPDATE books SET level = 2
WHERE source_platform = 'bloom' AND source_id = 'bf6fe85c-a533-4922-9492-afc63d992ce5';
UPDATE books SET level = 2
WHERE source_platform = 'bloom' AND source_id = '0a38c9cf-0606-4ad4-aefb-8a97c44d62d9';
UPDATE books SET level = 2
WHERE source_platform = 'bloom' AND source_id = '7ee7b9b7-eb02-4bd4-8633-652cf2f4ee77';
UPDATE books SET level = 2
WHERE source_platform = 'bloom' AND source_id = '64449775-1d4d-4852-b023-9c47bc51acc6';
UPDATE books SET level = 2
WHERE source_platform = 'bloom' AND source_id = '411f6dd4-ade3-4c44-b443-0cf3646ba3bb';
UPDATE books SET level = 2
WHERE source_platform = 'bloom' AND source_id = '71d66196-ee12-4a24-9b86-ee76bbfe88f5';
UPDATE books SET level = 2
WHERE source_platform = 'bloom' AND source_id = '7f4681dc-4106-4736-a10e-8516b242ec82';
UPDATE books SET level = 2
WHERE source_platform = 'bloom' AND source_id = 'b1be87dc-4c39-4c6d-bddd-5a1f8876a4dd';
UPDATE books SET level = 1
WHERE source_platform = 'bloom' AND source_id = 'c82262e3-4cc0-4346-8359-5de22b43827f';
UPDATE books SET level = 1
WHERE source_platform = 'bloom' AND source_id = '68808917-4849-43a2-823a-f6281e03b9d8';
UPDATE books SET level = 2
WHERE source_platform = 'bloom' AND source_id = 'b30b0142-c791-4a52-9a5e-a4d4e4f4bf2a';
UPDATE books SET level = 1
WHERE source_platform = 'bloom' AND source_id = '6f7c4247-7d8d-4e91-b0fb-24c822607e43';
UPDATE books SET level = 1
WHERE source_platform = 'bloom' AND source_id = 'e67a8023-b942-474a-8094-a355d831f3fc';
UPDATE books SET level = 1
WHERE source_platform = 'bloom' AND source_id = '468f071b-8251-4554-9e6f-21bfd9c5e57d';
UPDATE books SET level = 2
WHERE source_platform = 'bloom' AND source_id = '05bdb04b-3f95-4e7f-9332-f5444a7fca1a';
UPDATE books SET level = 2
WHERE source_platform = 'bloom' AND source_id = '19b38c09-b63b-4e97-aa3e-e4834056ae8f';
UPDATE books SET level = 2
WHERE source_platform = 'bloom' AND source_id = 'cf425be1-d87e-45f8-87af-963cad54e218';
UPDATE books SET level = 2
WHERE source_platform = 'bloom' AND source_id = '6c2a2c2f-e0d9-4ce8-85c9-2962ddb2584d';
UPDATE books SET level = 2
WHERE source_platform = 'bloom' AND source_id = '985f9b3a-bd32-4eaa-938a-a47c694c1ad7';
UPDATE books SET level = 1
WHERE source_platform = 'bloom' AND source_id = '6e57e9aa-063f-463d-ad3a-9df3e6e31da7';
UPDATE books SET level = 2
WHERE source_platform = 'bloom' AND source_id = 'ed9782f9-e3cd-483b-8217-9b86d2430c76';
UPDATE books SET level = 2
WHERE source_platform = 'bloom' AND source_id = '25ce9a8d-58d0-4577-838e-46fa897822ae';
UPDATE books SET level = 1
WHERE source_platform = 'bloom' AND source_id = '50a63a0a-6a95-4ea0-bd43-f6d1ba27457b';
UPDATE books SET level = 2
WHERE source_platform = 'bloom' AND source_id = 'b0f2a9ab-2326-4686-aa36-f8d57c859345';
UPDATE books SET level = 1
WHERE source_platform = 'bloom' AND source_id = '409a37a2-27aa-4bae-8421-8aafeab23bf6';
UPDATE books SET level = 1
WHERE source_platform = 'bloom' AND source_id = '1daac76a-b353-459a-a9cc-a2f0f8c8abc8';

-- 확인:
-- SELECT level, COUNT(*) FROM books WHERE source_platform='bloom'
--       AND source_id IN (
--       '4e1a12a3-5bd4-415b-a697-a1fe7824ce1c',
--       'bf6fe85c-a533-4922-9492-afc63d992ce5',
--       '0a38c9cf-0606-4ad4-aefb-8a97c44d62d9',
--       '7ee7b9b7-eb02-4bd4-8633-652cf2f4ee77',
--       '64449775-1d4d-4852-b023-9c47bc51acc6',
--       '411f6dd4-ade3-4c44-b443-0cf3646ba3bb',
--       '71d66196-ee12-4a24-9b86-ee76bbfe88f5',
--       '7f4681dc-4106-4736-a10e-8516b242ec82',
--       'b1be87dc-4c39-4c6d-bddd-5a1f8876a4dd',
--       'c82262e3-4cc0-4346-8359-5de22b43827f',
--       '68808917-4849-43a2-823a-f6281e03b9d8',
--       'b30b0142-c791-4a52-9a5e-a4d4e4f4bf2a',
--       '6f7c4247-7d8d-4e91-b0fb-24c822607e43',
--       'e67a8023-b942-474a-8094-a355d831f3fc',
--       '468f071b-8251-4554-9e6f-21bfd9c5e57d',
--       '05bdb04b-3f95-4e7f-9332-f5444a7fca1a',
--       '19b38c09-b63b-4e97-aa3e-e4834056ae8f',
--       'cf425be1-d87e-45f8-87af-963cad54e218',
--       '6c2a2c2f-e0d9-4ce8-85c9-2962ddb2584d',
--       '985f9b3a-bd32-4eaa-938a-a47c694c1ad7',
--       '6e57e9aa-063f-463d-ad3a-9df3e6e31da7',
--       'ed9782f9-e3cd-483b-8217-9b86d2430c76',
--       '25ce9a8d-58d0-4577-838e-46fa897822ae',
--       '50a63a0a-6a95-4ea0-bd43-f6d1ba27457b',
--       'b0f2a9ab-2326-4686-aa36-f8d57c859345',
--       '409a37a2-27aa-4bae-8421-8aafeab23bf6',
--       '1daac76a-b353-459a-a9cc-a2f0f8c8abc8'
--       ) GROUP BY level ORDER BY level;
