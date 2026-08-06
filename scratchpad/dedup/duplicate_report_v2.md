# 공개 도서 중복 표지 탐지 리포트 v2

> 읽기·분석 전용. DB 변경 없음. 비활성화 SQL은 팀장 확정 후 별도 생성.

## 요약

| 항목 | v1 | v2 |
|---|---|---|
| phash 해밍거리 임계값 | 8 | **4** |
| 분석 대상 권수 | 1852 | **1805** |
| 중복 그룹 수 | 194 | **160** |
| 중복으로 묶인 권수 | 453 | **347** |
| 유지 추천이 붙은 그룹 | 49 | **116** |
| 표지 오적재 후보(분리) | — | **48** |

판정 기준: phash 해밍거리 ≤ 4 (표지) / 정규화 제목 유사도 ≥ 0.90 (제목)

유지 추천 우선순위: ① 오디오 보유(audio_books.csv) → ② book_dash → ③ 표지 해상도 최대 → 동률 시 팀장 판단

바이트 동일 표지를 공유하는 도서 47권은 중복 도서가 아니라 **표지 오적재 후보**로 판단하여 본 리포트에서 제외했다 → `cover_reload_candidates.csv`

---

## 그룹 1 · 4권 · matched_by=`both`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/1eed0fae-6362-4dc3-aea1-1f51047bf373.jpg" width="110">](https://africanstorybook.org/illustrations/covers/7792.png) |  | A Dog | african_storybook | 38400 | `1eed0fae-6362-4dc3-aea1-1f51047bf373` |
| [<img src="covers/740f1ba1-dec9-400e-9796-8effc7c64e7b.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/glauredarwindy%40gmail.com%2fc5ba08ff-c462-4d41-8e95-cf8686ec6313%2fbloomdigital%2fASP_311-A_dog_Page_2_Image_0001.png) | **Y**<br>최대 해상도 | A dog | bloom | 358801 | `740f1ba1-dec9-400e-9796-8effc7c64e7b` |
| [<img src="covers/ef3c71df-1028-4e3e-a3d4-ac74ff65f29b.jpg" width="110">](https://africanstorybook.org/illustrations/covers/13978.png) |  | Papa's  Dog | african_storybook | 38400 | `ef3c71df-1028-4e3e-a3d4-ac74ff65f29b` |
| [<img src="covers/e4406029-931e-4ddc-938f-da5dcadc9782.jpg" width="110">](https://africanstorybook.org/illustrations/covers/24593.png) |  | Sami My Playful dog | african_storybook | 38400 | `e4406029-931e-4ddc-938f-da5dcadc9782` |

## 그룹 2 · 4권 · matched_by=`both`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/9c9d46f8-9223-432c-b7f4-1042c7dca4f4.jpg" width="110">](https://africanstorybook.org/illustrations/covers/35686.png) |  | Aria | african_storybook | 38400 | `9c9d46f8-9223-432c-b7f4-1042c7dca4f4` |
| [<img src="covers/8a91d89f-7642-4798-b23f-33dc9a3f91e5.jpg" width="110">](https://africanstorybook.org/illustrations/covers/31431.png) |  | I know colors | african_storybook | 38400 | `8a91d89f-7642-4798-b23f-33dc9a3f91e5` |
| [<img src="covers/0d8ea52c-b744-446a-85d8-764453cd35ed.jpg" width="110">](https://africanstorybook.org/illustrations/covers/9882.png) |  | My Body | african_storybook | 38400 | `0d8ea52c-b744-446a-85d8-764453cd35ed` |
| [<img src="covers/e6c80444-0a2e-4be2-8e20-12d190e65d93.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2023/04/35307-d05e2c60b94c428e076fbad0f2cc2778-coverImage.png) | **Y**<br>최대 해상도 | My Body | gdl | 248832 | `e6c80444-0a2e-4be2-8e20-12d190e65d93` |

## 그룹 3 · 4권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/00e0a3f0-b772-49f4-abed-e61bcd21540d.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/M90GN2MBu9%2f1718622628843%2fbloomdigital%2fThe%20Moon%20and%20The%20Cap_Page%20021.jpg) | **Y**<br>최대 해상도 | The Moon and the Cap | bloom | 627120 | `00e0a3f0-b772-49f4-abed-e61bcd21540d` |
| [<img src="covers/bf60510a-e361-409b-a476-1a657db3dc31.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2023/04/34927-02a526e3718a8a48210b48220f03776d-coverImage.jpeg) |  | The Moon and the Cap | gdl | 157896 | `bf60510a-e361-409b-a476-1a657db3dc31` |
| [<img src="covers/d828a5e0-4950-4120-9cde-137d2e4dcaa7.jpg" width="110">](https://africanstorybook.org/illustrations/covers/2154.png) |  | The Moon and the Cap | african_storybook | 38400 | `d828a5e0-4950-4120-9cde-137d2e4dcaa7` |
| [<img src="covers/f38a6ef5-54d6-42ef-bc3f-ab9f2a31be69.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/bethann_carlson%40sil.org%2f19b38c09-b63b-4e97-aa3e-e4834056ae8f%2fbloomdigital%2fThe%20Moon%20and%20The%20Cap_Cover.jpg) |  | The Moon and the Hat | bloom | 296400 | `f38a6ef5-54d6-42ef-bc3f-ab9f2a31be69` |

## 그룹 4 · 3권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/18c6ef40-7260-4aff-9db6-fb754c3437a5.jpg" width="110">](https://africanstorybook.org/illustrations/covers/15321.png) |  | Amazing Daisy | african_storybook | 38400 | `18c6ef40-7260-4aff-9db6-fb754c3437a5` |
| [<img src="covers/c9885925-bd2c-41b1-8fd2-5ae7c7b3dd23.jpg" width="110">](https://bookdash.github.io/bookdash-books/amazing-daisy/en/images/cover.jpg) | **Y**<br>오디오 보유 | Amazing Daisy | book_dash | 620944 | `c9885925-bd2c-41b1-8fd2-5ae7c7b3dd23` |
| [<img src="covers/ff8469b1-adb1-443a-a042-b70aee14d440.jpg" width="110">](https://africanstorybook.org/illustrations/covers/32309.png) |  | Amazing Daisy | african_storybook | 38400 | `ff8469b1-adb1-443a-a042-b70aee14d440` |

## 그룹 5 · 3권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/18b88728-0b7c-43d7-8d49-ed243da56288.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2023/04/35419-02a526e3718a8a48210b48220f03776d-coverImage.jpeg) |  | Bunty and Bubbly | gdl | 157896 | `18b88728-0b7c-43d7-8d49-ed243da56288` |
| [<img src="covers/3abddfc4-6979-49c1-a7db-1455503f8e2f.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/librarian%40bloomlibrary.org%2faf8da967-c9d1-4311-938b-4a20b8df5403%2fbloomdigital%2fSWPB_143-bunty-and-bubbly_Page_02_Image_0001.png) | **Y**<br>최대 해상도 | Bunty and Bubbly | bloom | 193200 | `3abddfc4-6979-49c1-a7db-1455503f8e2f` |
| [<img src="covers/c6c58313-07a8-4306-9a30-fdccbf787cb7.jpg" width="110">](https://africanstorybook.org/illustrations/covers/913.png) |  | Bunty and Bubbly | african_storybook | 38400 | `c6c58313-07a8-4306-9a30-fdccbf787cb7` |

## 그룹 6 · 3권 · matched_by=`both`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/82abae25-9cca-48bc-8b3b-7b56884282d2.jpg" width="110">](https://africanstorybook.org/illustrations/covers/18810.png) |  | Buttons | african_storybook | 38400 | `82abae25-9cca-48bc-8b3b-7b56884282d2` |
| [<img src="covers/b20df6b9-7b25-40cb-b789-b53a5fc14a23.jpg" width="110">](https://africanstorybook.org/illustrations/covers/24702.png) |  | Buttons | african_storybook | 38400 | `b20df6b9-7b25-40cb-b789-b53a5fc14a23` |
| [<img src="covers/d34eeba2-3bd1-4176-9e72-113a7534455f.jpg" width="110">](https://africanstorybook.org/illustrations/covers/24701.png) |  | Buttons | african_storybook | 38400 | `d34eeba2-3bd1-4176-9e72-113a7534455f` |

> 유지 추천 없음 — **팀장 판단(해상도 동률 3권)**

## 그룹 7 · 3권 · matched_by=`both`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/906ddc10-0988-48ec-9fc0-181c1424a13a.jpg" width="110">](https://africanstorybook.org/illustrations/covers/40186.png) |  | Cats and mice | african_storybook | 38400 | `906ddc10-0988-48ec-9fc0-181c1424a13a` |
| [<img src="covers/9872489e-5daa-449e-b1ec-46c2ddbc795b.jpg" width="110">](https://africanstorybook.org/illustrations/covers/18942.png) |  | Cats and Mice | african_storybook | 38400 | `9872489e-5daa-449e-b1ec-46c2ddbc795b` |
| [<img src="covers/10adc09e-3e96-4572-be81-01a4861f6035.jpg" width="110">](https://africanstorybook.org/illustrations/covers/20882.png) |  | Mice And Cats | african_storybook | 38400 | `10adc09e-3e96-4572-be81-01a4861f6035` |

> 유지 추천 없음 — **팀장 판단(해상도 동률 3권)**

## 그룹 8 · 3권 · matched_by=`both`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/0fe8a424-f2f4-435c-8ee5-21f69a63892d.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2022/03/httpsdigitallibrary.iowp-contentuploads20210436558-2d53fe4545becd5d894854649e3e2f40-image_1.jpg) | **Y**<br>최대 해상도 | Counting Animals | gdl | 440181 | `0fe8a424-f2f4-435c-8ee5-21f69a63892d` |
| [<img src="covers/795db11e-7356-46cf-9d19-ab4df92b2c34.jpg" width="110">](https://africanstorybook.org/illustrations/covers/9671.png) |  | Counting animals | african_storybook | 38400 | `795db11e-7356-46cf-9d19-ab4df92b2c34` |
| [<img src="covers/668bce5b-cddc-44e2-849a-fce569c46317.jpg" width="110">](https://africanstorybook.org/illustrations/covers/34284.png) |  | Water for all | african_storybook | 38400 | `668bce5b-cddc-44e2-849a-fce569c46317` |

## 그룹 9 · 3권 · matched_by=`both`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/6e5d6bd9-df15-42e8-9982-e9a11d486430.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2022/03/httpsdigitallibrary.iowp-contentuploads20201014571-7c82e3c3967af7cd0fc0bc6c6c18d468-dd703f8b200d567b475fc1cb3f0fd36e.jpg) | **Y**<br>최대 해상도 | Donkey And Ox | gdl | 345600 | `6e5d6bd9-df15-42e8-9982-e9a11d486430` |
| [<img src="covers/65761e3a-0775-45e2-a570-0034615ce68a.jpg" width="110">](https://africanstorybook.org/illustrations/covers/18333.png) |  | Ox and Donkey | african_storybook | 38400 | `65761e3a-0775-45e2-a570-0034615ce68a` |
| [<img src="covers/a7110831-8b45-482b-bfde-81c59866f597.jpg" width="110">](https://africanstorybook.org/illustrations/covers/21628.png) |  | Ox And Donkey | african_storybook | 38400 | `a7110831-8b45-482b-bfde-81c59866f597` |

## 그룹 10 · 3권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/1c5afcab-5897-426e-8c50-52d404a34739.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2022/03/httpsdigitallibrary.iowp-contentuploads20210941110-02a526e3718a8a48210b48220f03776d-coverImage.jpeg) | **Y**<br>최대 해상도 | Friends | gdl | 467370 | `1c5afcab-5897-426e-8c50-52d404a34739` |
| [<img src="covers/85529f20-8864-4c62-b496-e7d53841d6b5.jpg" width="110">](https://africanstorybook.org/illustrations/covers/9879.png) |  | Friends | african_storybook | 38400 | `85529f20-8864-4c62-b496-e7d53841d6b5` |
| [<img src="covers/dbd27774-7646-4b77-b917-65762a835ff4.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/bethann_carlson%40sil.org%2f9c801b5e-a190-43e3-83a1-cabf69346bad%2fbloomdigital%2fASP_128_friends_0_Page_02_Image_0001.png) |  | Friends | bloom | 358801 | `dbd27774-7646-4b77-b917-65762a835ff4` |

## 그룹 11 · 3권 · matched_by=`both`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/31d4ffd1-4bcf-4342-b65e-913eaf7350e5.jpg" width="110">](https://africanstorybook.org/illustrations/covers/35413.png) |  | How I got lost at the market | african_storybook | 38400 | `31d4ffd1-4bcf-4342-b65e-913eaf7350e5` |
| [<img src="covers/4d2d47c9-6a75-418c-8cbc-667258945124.jpg" width="110">](https://africanstorybook.org/illustrations/covers/21449.png) |  | How I Got Lost At The Market | african_storybook | 38400 | `4d2d47c9-6a75-418c-8cbc-667258945124` |
| [<img src="covers/cf10cbb8-b0ed-4ad0-9fdf-09cebe1e6998.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2022/03/httpsdigitallibrary.iowp-contentuploads20201014447-7c82e3c3967af7cd0fc0bc6c6c18d468-5883d7a377f04943764f92d657cb80ff.jpg) | **Y**<br>최대 해상도 | My First Day at the Market | gdl | 345600 | `cf10cbb8-b0ed-4ad0-9fdf-09cebe1e6998` |

## 그룹 12 · 3권 · matched_by=`both`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/4c887d97-7e3c-4d4f-b8da-30bdfd2b6f6b.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/bethann_carlson%40sil.org%2f2babed54-3cab-489a-a8c5-a4d22d062eb6%2fbloomdigital%2fSWPB_16_i-can-climb_Page_02_Image_0001.png) |  | I Can Climb | bloom | 171600 | `4c887d97-7e3c-4d4f-b8da-30bdfd2b6f6b` |
| [<img src="covers/2ecc2a7d-4cba-4fc6-8104-e2c6ee95ef69.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2022/03/httpsdigitallibrary.iowp-contentuploads20201015497-7c82e3c3967af7cd0fc0bc6c6c18d468-589c66bb3bfb158b9f6f784f36514163.jpg) | **Y**<br>최대 해상도 | I Can Climb! | gdl | 440181 | `2ecc2a7d-4cba-4fc6-8104-e2c6ee95ef69` |
| [<img src="covers/907a0e7d-ca68-4ab4-ab0b-5d660a7c7fed.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/librarian%40bloomlibrary.org%2fd4a64e1d-afe8-49cd-ab55-b163da7b400e%2fbloomdigital%2fSWPB_307-in-the-park_Page_02_Image_0001.png) |  | In the Park | bloom | 171600 | `907a0e7d-ca68-4ab4-ab0b-5d660a7c7fed` |

## 그룹 13 · 3권 · matched_by=`both`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/4564a9e5-5c3f-44ac-b148-16cf387f8b54.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2022/03/httpsdigitallibrary.iowp-contentuploads20201014509-7c82e3c3967af7cd0fc0bc6c6c18d468-603441156b72ed0acf91243c40e2f26b.jpg) |  | I Like To Read | gdl | 345600 | `4564a9e5-5c3f-44ac-b148-16cf387f8b54` |
| [<img src="covers/b26b1acf-7631-411e-8fc7-576a74f59d57.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/dictionaries_gillbt%40gillbt.org%2fd180f98a-9250-4319-baa0-fd6b8f8458e5%2fbloomdigital%2fASP_175_I_like_to_read_Page_02_Image_0001.png) | **Y**<br>최대 해상도 | I like to read | bloom | 360000 | `b26b1acf-7631-411e-8fc7-576a74f59d57` |
| [<img src="covers/da64f40e-4064-403b-991c-617cde610c88.jpg" width="110">](https://africanstorybook.org/illustrations/covers/12413.png) |  | I Love to Read | african_storybook | 38400 | `da64f40e-4064-403b-991c-617cde610c88` |

## 그룹 14 · 3권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/449b587b-4318-4884-8920-b9ceb4446406.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2022/03/httpsdigitallibrary.iowp-contentuploads20210941122-d05e2c60b94c428e076fbad0f2cc2778-coverImage.png) |  | Jobs | gdl | 345100 | `449b587b-4318-4884-8920-b9ceb4446406` |
| [<img src="covers/5da2f92d-0c5d-4892-ba26-086af21c01c4.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/joel.mallari%40deped.gov.ph%2f30581cb4-7728-494b-a97a-9587eb8247a2%2fbloomdigital%2fPage%204.jpg) |  | Jobs | bloom | 332445 | `5da2f92d-0c5d-4892-ba26-086af21c01c4` |
| [<img src="covers/9a64e1eb-9b98-4061-90b5-dd814a218b4f.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/hello%40luckydesign.ie%2fb30b0142-c791-4a52-9a5e-a4d4e4f4bf2a%2fbloomdigital%2fCover.jpg) | **Y**<br>최대 해상도 | Jobs | bloom | 360000 | `9a64e1eb-9b98-4061-90b5-dd814a218b4f` |

## 그룹 15 · 3권 · matched_by=`both`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/e8a19292-9f04-47c5-ab1b-9b3038b8a0c9.jpg" width="110">](https://africanstorybook.org/illustrations/covers/22197.png) |  | Kariza's questions | african_storybook | 38400 | `e8a19292-9f04-47c5-ab1b-9b3038b8a0c9` |
| [<img src="covers/83a228a2-ce33-494d-a6db-fa8c7a899f6d.jpg" width="110">](https://africanstorybook.org/illustrations/covers/35414.png) |  | Step and wash! | african_storybook | 38400 | `83a228a2-ce33-494d-a6db-fa8c7a899f6d` |
| [<img src="covers/dbf4b6d9-099a-4c6e-8da9-71c453916b60.jpg" width="110">](https://africanstorybook.org/illustrations/covers/34080.png) |  | Step and wash! | african_storybook | 38400 | `dbf4b6d9-099a-4c6e-8da9-71c453916b60` |

> 유지 추천 없음 — **팀장 판단(해상도 동률 3권)**

## 그룹 16 · 3권 · matched_by=`both`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/426312e6-fb6f-4c4f-aa9f-a0083dd68a92.jpg" width="110">](https://africanstorybook.org/illustrations/covers/32048.png) |  | My mother | african_storybook | 38400 | `426312e6-fb6f-4c4f-aa9f-a0083dd68a92` |
| [<img src="covers/bf6b2967-a8eb-472f-b36e-089a4366d27f.jpg" width="110">](https://africanstorybook.org/illustrations/covers/24441.png) |  | My mother | african_storybook | 38400 | `bf6b2967-a8eb-472f-b36e-089a4366d27f` |
| [<img src="covers/625aab17-1784-4dda-86c4-0f8e7d7dee3c.jpg" width="110">](https://africanstorybook.org/illustrations/covers/24673.png) |  | The beauty of a mother | african_storybook | 38400 | `625aab17-1784-4dda-86c4-0f8e7d7dee3c` |

> 유지 추천 없음 — **팀장 판단(해상도 동률 3권)**

## 그룹 17 · 3권 · matched_by=`both`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/47765b0a-694f-4b29-a037-de984facc223.jpg" width="110">](https://africanstorybook.org/illustrations/covers/2253.png) |  | Our Wonderful World | african_storybook | 38400 | `47765b0a-694f-4b29-a037-de984facc223` |
| [<img src="covers/27f4f971-d9ae-4976-911e-a832c025be49.jpg" width="110">](https://africanstorybook.org/illustrations/covers/20491.png) |  | Our World | african_storybook | 38400 | `27f4f971-d9ae-4976-911e-a832c025be49` |
| [<img src="covers/fd777194-0a4c-450f-ba3e-4fe3cb16fcd1.jpg" width="110">](https://africanstorybook.org/illustrations/covers/21712.png) |  | Our World | african_storybook | 38400 | `fd777194-0a4c-450f-ba3e-4fe3cb16fcd1` |

> 유지 추천 없음 — **팀장 판단(해상도 동률 3권)**

## 그룹 18 · 3권 · matched_by=`both`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/3e025af2-e08d-411a-96ff-cbe6e33b4d1d.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/bethann_carlson%40sil.org%2f232b4859-e9d8-497b-90bd-d4d6d1d8e038%2fbloomdigital%2fASP_123_rain_1_Page_02_Image_0001.png) |  | Rain | bloom | 358801 | `3e025af2-e08d-411a-96ff-cbe6e33b4d1d` |
| [<img src="covers/8447373c-62e7-491c-b90d-f075e8fde714.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/marian_hagg%40sil.org%2f80850f42-0f82-49db-b834-d3e6fe8caed2%2fbloomdigital%2fASP_123_rain_1_Page_02_Image_0001.png) |  | Rain | bloom | 358801 | `8447373c-62e7-491c-b90d-f075e8fde714` |
| [<img src="covers/be4927d8-ef29-4b90-92b5-63050e7e4877.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2023/09/38970-2d53fe4545becd5d894854649e3e2f40-image_1.jpg) | **Y**<br>최대 해상도 | Rain | gdl | 440181 | `be4927d8-ef29-4b90-92b5-63050e7e4877` |

## 그룹 19 · 3권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/86dbfc5a-7735-4abe-929f-97ec6036b387.jpg" width="110">](https://zuwbshdvpnranzheswdn.supabase.co/storage/v1/object/public/book-covers/asb-37771.png) |  | True friends | african_storybook | 298116 | `86dbfc5a-7735-4abe-929f-97ec6036b387` |
| [<img src="covers/c94b6bcf-29a8-4238-a75a-12f6787baede.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/8ByJNBbzCF%2f1766229040137%2fbloomdigital%2fSWPB_350-true-friends_Page_2_Image_1.png) | **Y**<br>최대 해상도 | True friends | bloom | 883200 | `c94b6bcf-29a8-4238-a75a-12f6787baede` |
| [<img src="covers/fe0e9a59-5369-410a-9256-0761c2808d9f.jpg" width="110">](https://zuwbshdvpnranzheswdn.supabase.co/storage/v1/object/public/book-covers/asb-35583.png) |  | True Friends | african_storybook | 298116 | `fe0e9a59-5369-410a-9256-0761c2808d9f` |

## 그룹 20 · 3권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/92efecf3-2aa2-4857-9b69-c79e5e6efebf.jpg" width="110">](https://bookdash.github.io/bookdash-books/what-if/en/images/cover.jpg) | **Y**<br>오디오 보유 | What if | book_dash | 620944 | `92efecf3-2aa2-4857-9b69-c79e5e6efebf` |
| [<img src="covers/2153fd1f-413f-4d92-875d-65921838784a.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2023/04/34708-02a526e3718a8a48210b48220f03776d-coverImage.jpeg) |  | What if...? | gdl | 360000 | `2153fd1f-413f-4d92-875d-65921838784a` |
| [<img src="covers/69fbf9ac-bd4e-40e2-a046-7f9136e3dd21.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2022/03/httpsdigitallibrary.iowp-contentuploads20201015593-7c82e3c3967af7cd0fc0bc6c6c18d468-badd7122aa68d2a339e359f03c03cc51.jpg) |  | What If? | gdl | 440181 | `69fbf9ac-bd4e-40e2-a046-7f9136e3dd21` |

## 그룹 21 · 3권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/1c304aa3-8292-4eb4-9f7a-ec663dd12de5.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/lumimaftei%40gmail.com%2f1daac76a-b353-459a-a9cc-a2f0f8c8abc8%2fbloomdigital%2fASP_100_where_is_my_bat_Page_01_Image_000111.jpg) |  | Where is my bat? | bloom | 267600 | `1c304aa3-8292-4eb4-9f7a-ec663dd12de5` |
| [<img src="covers/5ac92c9b-80e3-4da8-b970-85b0e736163e.jpg" width="110">](https://africanstorybook.org/illustrations/covers/2615.png) |  | Where is my Bat? | african_storybook | 38400 | `5ac92c9b-80e3-4da8-b970-85b0e736163e` |
| [<img src="covers/e147b8b7-7e32-4aca-9ca5-371f34ae2462.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/XO5qBMpyjZ%2f1767855458181%2fbloomdigital%2fASP_100_where_is_my_bat_Page_02_Image_1.jpg) | **Y**<br>최대 해상도 | Where is my bat? | bloom | 770768 | `e147b8b7-7e32-4aca-9ca5-371f34ae2462` |

## 그룹 22 · 3권 · matched_by=`both`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/39f5decc-aa1e-4fea-a8ce-90c13e1959eb.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2022/03/httpsdigitallibrary.iowp-contentuploads20201021351-7c82e3c3967af7cd0fc0bc6c6c18d468-18822c6429bd134f30d1d1bc59c992c0.jpg) |  | Where is My Mother? | gdl | 440181 | `39f5decc-aa1e-4fea-a8ce-90c13e1959eb` |
| [<img src="covers/8ca85744-561b-4098-938c-32cf495cebbe.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/4h6e5PULlb%2f1775134769041%2fbloomdigital%2fPicture2.jpg) |  | Where is My Mother? | bloom | 558720 | `8ca85744-561b-4098-938c-32cf495cebbe` |
| [<img src="covers/e4933cfc-7af8-4f53-a648-8606f51e8851.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/Cn0ZRu6Nlp%2f1777997001660%2fbloomdigital%2fPicture2.jpg) |  | Where is My Mother? | bloom | 558720 | `e4933cfc-7af8-4f53-a648-8606f51e8851` |

> 유지 추천 없음 — **팀장 판단(해상도 동률 2권)**

## 그룹 23 · 3권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/79d48c99-3f81-4738-92da-bbc53aa7a296.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2022/03/httpsdigitallibrary.iowp-contentuploads20201021325-7c82e3c3967af7cd0fc0bc6c6c18d468-7d3abad2a15b05808721616c9441898c.jpg) |  | Whose House is This? | gdl | 440181 | `79d48c99-3f81-4738-92da-bbc53aa7a296` |
| [<img src="covers/11e426a8-9b20-4941-9b5d-434e97292348.jpg" width="110">](https://zuwbshdvpnranzheswdn.supabase.co/storage/v1/object/public/book-covers/bookdash-whose-shoe-is-this.webp) | **Y**<br>오디오 보유 | Whose shoe is this? | book_dash | 360000 | `11e426a8-9b20-4941-9b5d-434e97292348` |
| [<img src="covers/313b9a30-44fb-4035-ae44-93873d3690c4.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/SAbuXLPfAD%2f1749017810025%2fbloomdigital%2fwhose-shoe-is-this_page2.jpg) |  | Whose shoe is this? | bloom | 819200 | `313b9a30-44fb-4035-ae44-93873d3690c4` |

## 그룹 24 · 3권 · matched_by=`both`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/017d6e74-ff54-44df-95e8-11f14b005ab6.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/lR322jIgeL%2f1748922145631%2fbloomdigital%2fimage1.jpg) |  | Wild Cat! Wild Cat! | bloom | 192878 | `017d6e74-ff54-44df-95e8-11f14b005ab6` |
| [<img src="covers/d38092cf-a3a6-4160-a6ac-bc3ebc59aa5e.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2022/03/httpsdigitallibrary.iowp-contentuploads20201017233-7c82e3c3967af7cd0fc0bc6c6c18d468-989e58db2662c9191f01d170bedaab3f.jpg) | **Y**<br>최대 해상도 | Wild Cat! Wild Cat! | gdl | 440181 | `d38092cf-a3a6-4160-a6ac-bc3ebc59aa5e` |
| [<img src="covers/d743a359-4de5-411a-b9e1-f219a1d13d21.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/educationforlife%40sil.org%2f4a2049ca-557f-4704-b7d3-fce6fa119795%2fbloomdigital%2fimage1.jpg) |  | Wild Cat! Wild Cat! | bloom | 192878 | `d743a359-4de5-411a-b9e1-f219a1d13d21` |

## 그룹 25 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/bd07f136-b653-4504-938c-e1f78cbdbd54.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2022/03/httpsdigitallibrary.iowp-contentuploads20201015469-7c82e3c3967af7cd0fc0bc6c6c18d468-55acf182b36e4f72a33016ecbc22001d.jpg) | **Y**<br>최대 해상도 | "My fish!" "No, my fish!" | gdl | 905296 | `bd07f136-b653-4504-938c-e1f78cbdbd54` |
| [<img src="covers/bde8b497-06fd-424c-ae18-4ba17a104257.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/91aAa9nTS5%2f1770719536381%2fbloomdigital%2fSWPB_53-my-fish-no-my-fish_Page_02_Image_0001.jpg) |  | "My fish!" "No, my fish!" | bloom | 525589 | `bde8b497-06fd-424c-ae18-4ba17a104257` |

## 그룹 26 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/20eee28a-86e4-45e4-9c52-9575e4f41d8f.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2022/03/httpsdigitallibrary.iowp-contentuploads20201017223-7c82e3c3967af7cd0fc0bc6c6c18d468-fdb7c9688dc6dd29e5519f00fe642e6e.jpg) |  | 7 Colours of a Rainbow | gdl | 440181 | `20eee28a-86e4-45e4-9c52-9575e4f41d8f` |
| [<img src="covers/76732ac9-2f18-4c43-b975-9464dce94113.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/educationforlife%40sil.org%2f8b4422c7-2558-4aa2-a551-1cf7366e343c%2fbloomdigital%2fASP_41_coloursofarainbow_Page_01_Image_00011.jpg) | **Y**<br>최대 해상도 | Colours of a Rainbow | bloom | 810000 | `76732ac9-2f18-4c43-b975-9464dce94113` |

## 그룹 27 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/0224c5f6-82c2-424f-b2ee-2c857c18fa89.jpg" width="110">](https://africanstorybook.org/illustrations/covers/12968.png) |  | A Careless Man | african_storybook | 38400 | `0224c5f6-82c2-424f-b2ee-2c857c18fa89` |
| [<img src="covers/b372c9d2-55d0-4f89-8b9e-9298b47fdcff.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/glauredarwindy%40gmail.com%2f4c88d493-a3e0-437a-8ee5-7599be7a2b3c%2fbloomdigital%2fASP_80_a_careless_man_Page_02_Image_0001.png) | **Y**<br>최대 해상도 | A careless man | bloom | 358801 | `b372c9d2-55d0-4f89-8b9e-9298b47fdcff` |

## 그룹 28 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/77de020c-ac99-4b7f-b470-b61717c90340.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2023/04/35476-02a526e3718a8a48210b48220f03776d-coverImage.jpeg) |  | A Dancer's Tale | gdl | 203401 | `77de020c-ac99-4b7f-b470-b61717c90340` |
| [<img src="covers/74b531b1-4aa3-4b91-ae1e-00dd95e7e910.jpg" width="110">](https://bookdash.github.io/bookdash-books/a-dancers-tale/en/images/cover.jpg) | **Y**<br>book_dash | A Dancer’s Tale | book_dash | 1000000 | `74b531b1-4aa3-4b91-ae1e-00dd95e7e910` |

## 그룹 29 · 2권 · matched_by=`both`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/af887c49-531a-4d26-9db4-b820648b9b6b.jpg" width="110">](https://africanstorybook.org/illustrations/covers/5394.png) |  | A Hot Saturday | african_storybook | 38400 | `af887c49-531a-4d26-9db4-b820648b9b6b` |
| [<img src="covers/e11550fa-4082-43e0-8f00-681454d31edf.jpg" width="110">](https://africanstorybook.org/illustrations/covers/13453.png) |  | A Hot Saturday | african_storybook | 38400 | `e11550fa-4082-43e0-8f00-681454d31edf` |

> 유지 추천 없음 — **팀장 판단(해상도 동률 2권)**

## 그룹 30 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/071d4a45-ecf2-4f24-a644-01955cfd93e7.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/gdPBvX1a7W%2f1743765822108%2fbloomdigital%2fASP_108_a_house_for_mouse_1_Page_02_Image_0001.jpg) |  | A House for Mouse | bloom | 358801 | `071d4a45-ecf2-4f24-a644-01955cfd93e7` |
| [<img src="covers/52d93876-df1b-4e27-b0e9-02c24a8ed4ea.jpg" width="110">](https://bookdash.github.io/bookdash-books/a-house-for-mouse/en/images/cover.jpg) | **Y**<br>book_dash | A House for Mouse | book_dash | 620944 | `52d93876-df1b-4e27-b0e9-02c24a8ed4ea` |

## 그룹 31 · 2권 · matched_by=`both`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/b134655b-fd4b-41a5-86a2-a4c6fe7f236b.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2022/03/httpsdigitallibrary.iowp-contentuploads20201015571-7c82e3c3967af7cd0fc0bc6c6c18d468-aa792962f7e2893a52a41e576c1b63c3-1.jpg) | **Y**<br>최대 해상도 | A Street or a Zoo? | gdl | 903378 | `b134655b-fd4b-41a5-86a2-a4c6fe7f236b` |
| [<img src="covers/6d62d996-ee93-4b29-b2e7-e75f4689a0ce.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/okuukeremetbooks%40gmail.com%2f0a38c9cf-0606-4ad4-aefb-8a97c44d62d9%2fbloomdigital%2fSWPB_257-a-street-or-a-zoo_Page_01_Image_0001.jpg) |  | A Street, or a Zoo? | bloom | 353400 | `6d62d996-ee93-4b29-b2e7-e75f4689a0ce` |

## 그룹 32 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/0134f341-7b58-4c7c-b17a-8d4e036dcd72.jpg" width="110">](https://zuwbshdvpnranzheswdn.supabase.co/storage/v1/object/public/book-covers/bookdash-a-trip-to-the-tap.webp) | **Y**<br>오디오 보유 | A trip to the tap | book_dash | 360000 | `0134f341-7b58-4c7c-b17a-8d4e036dcd72` |
| [<img src="covers/7f8925c4-ccd4-4738-863b-ea20097aa12d.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/B1WRiH3kiE%2f1763102884063%2fbloomdigital%2fa-trip-to-the-tap_page2.jpg) |  | A Trip to the Tap | bloom | 819200 | `7f8925c4-ccd4-4738-863b-ea20097aa12d` |

## 그룹 33 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/099fef93-cf3c-42d0-8a55-4cfcd65f7cd9.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2023/04/34983-02a526e3718a8a48210b48220f03776d-coverImage.jpeg) |  | A Very Busy Day | gdl | 112290 | `099fef93-cf3c-42d0-8a55-4cfcd65f7cd9` |
| [<img src="covers/3e219305-97f9-49a7-8a80-0c6767145af7.jpg" width="110">](https://zuwbshdvpnranzheswdn.supabase.co/storage/v1/object/public/book-covers/bookdash-a-very-busy-day.webp) | **Y**<br>오디오 보유 | A very busy day! | book_dash | 360000 | `3e219305-97f9-49a7-8a80-0c6767145af7` |

## 그룹 34 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/35e5d037-2b21-4144-8b55-9f9888c4e88c.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/educationforlife%40sil.org%2f79a4b0d1-2040-40c4-a955-980eaeb6e2cd%2fbloomdigital%2fslice8.jpg) |  | A5-Why Can't We Glow Like Fireflies? | bloom | 349816 | `35e5d037-2b21-4144-8b55-9f9888c4e88c` |
| [<img src="covers/9115e0ff-91fe-45ee-a00b-94c803a10715.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2023/04/34744-02a526e3718a8a48210b48220f03776d-coverImage.jpeg) | **Y**<br>최대 해상도 | Why Can't We Glow Like Fireflies? | gdl | 441140 | `9115e0ff-91fe-45ee-a00b-94c803a10715` |

## 그룹 35 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/6a054991-e52f-4255-b675-7be74dd77543.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/lumimaftei%40gmail.com%2fa6372358-e984-4c17-8bdf-f1d7ff8db4a6%2fbloomdigital%2fSWPB_9_aaloo-maaloo-kaaloo_Page_02_Image_000111.png) |  | Aaloo-Maaloo-Kaaloo | bloom | 205457 | `6a054991-e52f-4255-b675-7be74dd77543` |
| [<img src="covers/79022238-2f97-47e3-9490-342166c1fcc2.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2022/03/httpsdigitallibrary.iowp-contentuploads20201015607-7c82e3c3967af7cd0fc0bc6c6c18d468-8c9f0371207329ffa6fb450270ac73ba.jpg) | **Y**<br>최대 해상도 | Aaloo-Maaloo-Kaaloo | gdl | 440181 | `79022238-2f97-47e3-9490-342166c1fcc2` |

## 그룹 36 · 2권 · matched_by=`cover`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/35283d41-f3cb-45d2-a64d-53b76458b185.jpg" width="110">](https://africanstorybook.org/illustrations/covers/21453.png) |  | Abike's Day | african_storybook | 38400 | `35283d41-f3cb-45d2-a64d-53b76458b185` |
| [<img src="covers/646a8062-91ab-41de-8321-c9fd90f3be9d.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2022/03/httpsdigitallibrary.iowp-contentuploads20201014457-7c82e3c3967af7cd0fc0bc6c6c18d468-548cd1f0e53925630cb6f9068c9d7155.jpg) | **Y**<br>최대 해상도 | Akai's Special Mat | gdl | 345600 | `646a8062-91ab-41de-8321-c9fd90f3be9d` |

## 그룹 37 · 2권 · matched_by=`both`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/50c2d7b6-c273-4fb6-b806-92d4de760aac.jpg" width="110">](https://africanstorybook.org/illustrations/covers/36106.png) |  | Advice from an old man | african_storybook | 38400 | `50c2d7b6-c273-4fb6-b806-92d4de760aac` |
| [<img src="covers/88829ea5-4595-405a-8c98-ee6d71e901aa.jpg" width="110">](https://africanstorybook.org/illustrations/covers/22034.png) |  | Advice from an old man | african_storybook | 38400 | `88829ea5-4595-405a-8c98-ee6d71e901aa` |

> 유지 추천 없음 — **팀장 판단(해상도 동률 2권)**

## 그룹 38 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/94a7fa50-46d4-4e55-8ee8-43d8782e848a.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/sAyekK3nIS%2f1745470056314%2fbloomdigital%2famahle-wants-to-help_page2%20%281280p%29.jpg) |  | Amahle wants to help! | bloom | 819200 | `94a7fa50-46d4-4e55-8ee8-43d8782e848a` |
| [<img src="covers/f3e5da2f-a04d-4b08-ac81-4dee971c15e8.jpg" width="110">](https://zuwbshdvpnranzheswdn.supabase.co/storage/v1/object/public/book-covers/bookdash-amahle-wants-to-help.webp) | **Y**<br>오디오 보유 | Amahle wants to help! | book_dash | 360000 | `f3e5da2f-a04d-4b08-ac81-4dee971c15e8` |

## 그룹 39 · 2권 · matched_by=`cover`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/044a9459-d6bd-48c6-8ca5-4ec334bb6aa9.jpg" width="110">](https://africanstorybook.org/illustrations/covers/996.png) |  | Anansi and Vulture | african_storybook | 38400 | `044a9459-d6bd-48c6-8ca5-4ec334bb6aa9` |
| [<img src="covers/f4e5d015-05c3-4e8a-ad1c-8591a5795dc6.jpg" width="110">](https://africanstorybook.org/illustrations/covers/21247.png) |  | Jealous Anansi | african_storybook | 38400 | `f4e5d015-05c3-4e8a-ad1c-8591a5795dc6` |

> 유지 추천 없음 — **팀장 판단(해상도 동률 2권)**

## 그룹 40 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/c7a9c656-dc93-46a0-b16e-dfbef88e62b7.jpg" width="110">](https://zuwbshdvpnranzheswdn.supabase.co/storage/v1/object/public/book-covers/bookdash-and-also.webp) | **Y**<br>book_dash | And Also! | book_dash | 321489 | `c7a9c656-dc93-46a0-b16e-dfbef88e62b7` |
| [<img src="covers/fed03c97-9d84-433b-9e29-f028de2be8f1.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2022/05/httpsdigitallibrary.iowp-contentuploads20220547225-2d53fe4545becd5d894854649e3e2f40-image_1.jpg) |  | And Also! | gdl | 440181 | `fed03c97-9d84-433b-9e29-f028de2be8f1` |

## 그룹 41 · 2권 · matched_by=`cover`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/11d1054f-265c-4868-8256-2a10fe5962dc.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/glauredarwindy%40gmail.com%2f6aeee620-14f3-4d0b-9647-10e88b0a5c6b%2fbloomdigital%2fASP_134_animals_animals_1_Page_02_Image_0001.png) |  | Animals, Animals | bloom | 246000 | `11d1054f-265c-4868-8256-2a10fe5962dc` |
| [<img src="covers/1e7bf076-1de2-41e1-baca-1b0e88c69555.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/bethann_carlson%40sil.org%2f057fb0e4-1ebf-421b-b6cc-cbf520c83501%2fbloomdigital%2fASP_170_Domestic_animals_Page_02_Image_0001.png) |  | Tom Keeps Animals | bloom | 246000 | `1e7bf076-1de2-41e1-baca-1b0e88c69555` |

> 유지 추천 없음 — **팀장 판단(해상도 동률 2권)**

## 그룹 42 · 2권 · matched_by=`cover`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/2f24fffa-240c-4555-a73c-35d46c7fc299.jpg" width="110">](https://africanstorybook.org/illustrations/covers/24300.png) |  | Aniy'amanya the brave girl | african_storybook | 38400 | `2f24fffa-240c-4555-a73c-35d46c7fc299` |
| [<img src="covers/60f09a44-af0f-4c97-9763-b3b7f8a0cf45.jpg" width="110">](https://africanstorybook.org/illustrations/covers/24697.png) |  | Peddy the lazy girl | african_storybook | 38400 | `60f09a44-af0f-4c97-9763-b3b7f8a0cf45` |

> 유지 추천 없음 — **팀장 판단(해상도 동률 2권)**

## 그룹 43 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/df646401-b12b-4984-bf0b-d8fac7f250d7.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/librarian%40bloomlibrary.org%2f7ccef56e-0191-4b4b-8fd8-08f4ae184bca%2fbloomdigital%2fSWPB_22-annual-haircut-day_Page_02_Image_0001.png) |  | Annual Haircut Day | bloom | 193200 | `df646401-b12b-4984-bf0b-d8fac7f250d7` |
| [<img src="covers/ecf93ed6-7846-4ff1-a19a-189554a49540.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2022/03/httpsdigitallibrary.iowp-contentuploads20201015629-7c82e3c3967af7cd0fc0bc6c6c18d468-8701590b347c5a01ae5b7be80e4c872d.jpg) | **Y**<br>최대 해상도 | Annual Haircut Day | gdl | 440181 | `ecf93ed6-7846-4ff1-a19a-189554a49540` |

## 그룹 44 · 2권 · matched_by=`cover`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/96435276-a2f2-46da-b5ac-321692526299.jpg" width="110">](https://africanstorybook.org/illustrations/covers/21965.png) |  | Asa The Princess | african_storybook | 38400 | `96435276-a2f2-46da-b5ac-321692526299` |
| [<img src="covers/72422763-7947-4fbf-b709-c538b666c58b.jpg" width="110">](https://africanstorybook.org/illustrations/covers/33743.png) |  | Princess Asa | african_storybook | 38400 | `72422763-7947-4fbf-b709-c538b666c58b` |

> 유지 추천 없음 — **팀장 판단(해상도 동률 2권)**

## 그룹 45 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/4bb8557d-0ad7-4a35-9aba-39f12dc986f1.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/hIW297bgYV%2f1739361169582%2fbloomdigital%2fASP_146_azizi_the_doll_1_Page_02_Image_0001.jpg) | **Y**<br>최대 해상도 | Azizi the doll | bloom | 358801 | `4bb8557d-0ad7-4a35-9aba-39f12dc986f1` |
| [<img src="covers/a76eb254-fb11-47a9-bdee-d0d58bdd7b38.jpg" width="110">](https://africanstorybook.org/illustrations/covers/9748.png) |  | Azizi the Doll | african_storybook | 38400 | `a76eb254-fb11-47a9-bdee-d0d58bdd7b38` |

## 그룹 46 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/7139266e-142b-40d6-89b6-b863d0237f92.jpg" width="110">](https://africanstorybook.org/illustrations/covers/9117.png) |  | Bathtub Safari | african_storybook | 38400 | `7139266e-142b-40d6-89b6-b863d0237f92` |
| [<img src="covers/e50bd660-92c8-4938-b342-b43409bdb99f.jpg" width="110">](https://bookdash.github.io/bookdash-books/bathtub-safari/en/images/cover.jpg) | **Y**<br>오디오 보유 | Bathtub Safari | book_dash | 610700 | `e50bd660-92c8-4938-b342-b43409bdb99f` |

## 그룹 47 · 2권 · matched_by=`both`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/2bf7afb3-1676-4584-9f5b-869f24382cfa.jpg" width="110">](https://africanstorybook.org/illustrations/covers/23936.png) |  | Bird Hunters | african_storybook | 38400 | `2bf7afb3-1676-4584-9f5b-869f24382cfa` |
| [<img src="covers/9a386b81-8fde-4052-9f95-6087a0f33184.jpg" width="110">](https://africanstorybook.org/illustrations/covers/9934.png) |  | Bird Hunters | african_storybook | 38400 | `9a386b81-8fde-4052-9f95-6087a0f33184` |

> 유지 추천 없음 — **팀장 판단(해상도 동률 2권)**

## 그룹 48 · 2권 · matched_by=`both`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/0e56cccd-1a40-4e4c-ab5a-3ba6be875f9f.jpg" width="110">](https://africanstorybook.org/illustrations/covers/37033.png) |  | Bohlale's adventure | african_storybook | 38400 | `0e56cccd-1a40-4e4c-ab5a-3ba6be875f9f` |
| [<img src="covers/4114209b-bc43-4ade-b09c-24b1a1ef3b6a.jpg" width="110">](https://africanstorybook.org/illustrations/covers/36820.png) |  | Bohlale's adventure | african_storybook | 38400 | `4114209b-bc43-4ade-b09c-24b1a1ef3b6a` |

> 유지 추천 없음 — **팀장 판단(해상도 동률 2권)**

## 그룹 49 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/6a425443-d060-40f3-8195-38aee478f48c.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/aliyaraj334%40gmail.com%2f22785a51-5eeb-421f-a52d-0e1fa47ad35f%2fbloomdigital%2f1052-busy-ants_Page_02_Image_0001.png) |  | Busy Ants | bloom | 171600 | `6a425443-d060-40f3-8195-38aee478f48c` |
| [<img src="covers/c48a4d20-b6ea-4020-8a96-7115b4074645.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2022/03/httpsdigitallibrary.iowp-contentuploads20201015481-7c82e3c3967af7cd0fc0bc6c6c18d468-2393156f9478aff8deff1bb8928afea6.jpg) | **Y**<br>최대 해상도 | Busy ants | gdl | 440181 | `c48a4d20-b6ea-4020-8a96-7115b4074645` |

## 그룹 50 · 2권 · matched_by=`cover`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/9b6cc5eb-9c70-4e0c-b213-e4e5577245ef.jpg" width="110">](https://africanstorybook.org/illustrations/covers/32011.png) |  | Can you see them? | african_storybook | 38400 | `9b6cc5eb-9c70-4e0c-b213-e4e5577245ef` |
| [<img src="covers/02e6e2cb-9607-418b-a708-acc580d1b883.jpg" width="110">](https://africanstorybook.org/illustrations/covers/22681.png) |  | Where Is...? | african_storybook | 38400 | `02e6e2cb-9607-418b-a708-acc580d1b883` |

> 유지 추천 없음 — **팀장 판단(해상도 동률 2권)**

## 그룹 51 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/a2adff2c-5106-4cd1-9129-287aef3d25c2.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2023/04/35393-02a526e3718a8a48210b48220f03776d-coverImage.jpeg) |  | Catch that Cat | gdl | 62920 | `a2adff2c-5106-4cd1-9129-287aef3d25c2` |
| [<img src="covers/56027756-fc5d-45f9-8b8c-fe33727e6089.jpg" width="110">](https://zuwbshdvpnranzheswdn.supabase.co/storage/v1/object/public/book-covers/bookdash-catch-that-cat.webp) | **Y**<br>book_dash | Catch That Cat! | book_dash | 360000 | `56027756-fc5d-45f9-8b8c-fe33727e6089` |

## 그룹 52 · 2권 · matched_by=`cover`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/5448655a-a11b-4243-999b-c21a3bd37fd1.jpg" width="110">](https://africanstorybook.org/illustrations/covers/21412.png) |  | Chiefs Versus Aces | african_storybook | 38400 | `5448655a-a11b-4243-999b-c21a3bd37fd1` |
| [<img src="covers/2b90bc26-0951-450b-8681-8f9248243679.jpg" width="110">](https://africanstorybook.org/illustrations/covers/9827.png) |  | Soccer Game Chiefs and Aces | african_storybook | 38400 | `2b90bc26-0951-450b-8681-8f9248243679` |

> 유지 추천 없음 — **팀장 판단(해상도 동률 2권)**

## 그룹 53 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/0155f30d-3020-48d8-b39c-4f3c5c48695a.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/wubuy.edu%40gmail.com%2faa66ad93-d1a3-4f4e-996c-3b98d7b77765%2fbloomdigital%2fvpjhbdsc.1sh.png) | **Y**<br>최대 해상도 | Clouds | bloom | 389520 | `0155f30d-3020-48d8-b39c-4f3c5c48695a` |
| [<img src="covers/88831d12-c665-4a69-afb4-3e2a31ce69da.jpg" width="110">](https://africanstorybook.org/illustrations/covers/2122.png) |  | Clouds | african_storybook | 38400 | `88831d12-c665-4a69-afb4-3e2a31ce69da` |

## 그룹 54 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/4cfebf70-984b-40dd-b4da-6da41b235f18.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2023/04/35512-02a526e3718a8a48210b48220f03776d-coverImage.jpeg) | **Y**<br>최대 해상도 | Colorful Birds | gdl | 440271 | `4cfebf70-984b-40dd-b4da-6da41b235f18` |
| [<img src="covers/f0de905d-d804-452f-83c0-a6d0642dbc5a.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2022/03/httpsdigitallibrary.iowp-contentuploads20201021205-7c82e3c3967af7cd0fc0bc6c6c18d468-9fe2b712b698ef09d2c8e5f4fe1a82d2.jpg) |  | Colourful Birds | gdl | 440181 | `f0de905d-d804-452f-83c0-a6d0642dbc5a` |

## 그룹 55 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/3ddac66b-b30e-439c-a620-22ebd4553c04.jpg" width="110">](https://africanstorybook.org/illustrations/covers/1927.png) |  | Colours | african_storybook | 38400 | `3ddac66b-b30e-439c-a620-22ebd4553c04` |
| [<img src="covers/e085a251-6694-470a-a2ae-9b5e5a12785b.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2022/03/httpsdigitallibrary.iowp-contentuploads20201021025-7c82e3c3967af7cd0fc0bc6c6c18d468-50494d95575d7ac6c404812d38043fcd.jpg) | **Y**<br>최대 해상도 | Colours | gdl | 440181 | `e085a251-6694-470a-a2ae-9b5e5a12785b` |

## 그룹 56 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/ca5f6f07-3448-4d64-b6a1-f60b4860db3e.jpg" width="110">](https://africanstorybook.org/illustrations/covers/9125.png) |  | Come Back, Cat | african_storybook | 38400 | `ca5f6f07-3448-4d64-b6a1-f60b4860db3e` |
| [<img src="covers/f35dd8ae-2408-46c0-8794-f7e931abddab.jpg" width="110">](https://bookdash.github.io/bookdash-books/come-back-cat/en/images/cover.jpg) | **Y**<br>오디오 보유 | Come Back, Cat! | book_dash | 620944 | `f35dd8ae-2408-46c0-8794-f7e931abddab` |

## 그룹 57 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/922b681b-882b-44fc-80fd-7b9fdce571d0.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2022/03/httpsdigitallibrary.iowp-contentuploads20201014577-7c82e3c3967af7cd0fc0bc6c6c18d468-c0db56b02a147aaf42ceff6aaf9233e1.jpg) | **Y**<br>최대 해상도 | Curious Baby Elephant | gdl | 345600 | `922b681b-882b-44fc-80fd-7b9fdce571d0` |
| [<img src="covers/e7348182-dcbc-426d-a089-33aa393a213a.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/marian_hagg%40sil.org%2f1ac0266a-60eb-4838-a25c-68ff3d5ebbae%2fbloomdigital%2fCurious_baby_elephant_Page_02_Image_1.png) |  | Curious baby elephant | bloom | 261763 | `e7348182-dcbc-426d-a089-33aa393a213a` |

## 그룹 58 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/0a628df6-3816-4f1a-8d1a-aa7a0f8c53cb.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2022/08/26286-d05e2c60b94c428e076fbad0f2cc2778-coverImage.png) |  | Dance, Mihlali! | gdl | 262845 | `0a628df6-3816-4f1a-8d1a-aa7a0f8c53cb` |
| [<img src="covers/cdd9d224-fe05-4f19-8b91-e1517bfb8e76.jpg" width="110">](https://zuwbshdvpnranzheswdn.supabase.co/storage/v1/object/public/book-covers/bookdash-dance-mihlali.webp) | **Y**<br>오디오 보유 | Dance, Mihlali! | book_dash | 363600 | `cdd9d224-fe05-4f19-8b91-e1517bfb8e76` |

## 그룹 59 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/95be288f-2150-40d9-8f63-34af248c440d.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/j.l.schafer80%40gmail.com%2f22e8ca3b-9cb6-465a-b3ab-5eb0753aab92%2fbloomdigital%2fM_ASP_30%20Dancing_Page_2_Image_0001.png) | **Y**<br>최대 해상도 | Dancing | bloom | 516961 | `95be288f-2150-40d9-8f63-34af248c440d` |
| [<img src="covers/b829175a-a379-49d5-92da-5dc3402424e1.jpg" width="110">](https://africanstorybook.org/illustrations/covers/2183.png) |  | Dancing | african_storybook | 38400 | `b829175a-a379-49d5-92da-5dc3402424e1` |

## 그룹 60 · 2권 · matched_by=`cover`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/a6e96eff-de0c-4e9d-806e-e9af7ef79616.jpg" width="110">](https://africanstorybook.org/illustrations/covers/15029.png) |  | Day I left home for the city | african_storybook | 38400 | `a6e96eff-de0c-4e9d-806e-e9af7ef79616` |
| [<img src="covers/6b1bf2a3-09d6-442b-952e-1f39d08d58d6.jpg" width="110">](https://africanstorybook.org/illustrations/covers/21398.png) |  | Going To The Big City | african_storybook | 38400 | `6b1bf2a3-09d6-442b-952e-1f39d08d58d6` |

> 유지 추천 없음 — **팀장 판단(해상도 동률 2권)**

## 그룹 61 · 2권 · matched_by=`cover`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/4952e655-47ab-4202-88b6-0f4a7abdc3e3.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2022/03/httpsdigitallibrary.iowp-contentuploads20210537986-02a526e3718a8a48210b48220f03776d-coverImage.jpeg) |  | Didi and the Colorful Treasure | gdl | 440181 | `4952e655-47ab-4202-88b6-0f4a7abdc3e3` |
| [<img src="covers/f2d18625-af56-4203-a499-c51a299b2df4.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/5qSVBXb0Hn%2f1767768466822%2fbloomdigital%2fSWPB_333-didi-s-knowledge_Page_01_Image_0001.png) | **Y**<br>최대 해상도 | Didi's knowledge | bloom | 785306 | `f2d18625-af56-4203-a499-c51a299b2df4` |

## 그룹 62 · 2권 · matched_by=`cover`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/613f4c80-a60f-4c42-9159-a66fabf0d1f0.jpg" width="110">](https://africanstorybook.org/illustrations/covers/35268.png) |  | Duma says wash your hands! | african_storybook | 38400 | `613f4c80-a60f-4c42-9159-a66fabf0d1f0` |
| [<img src="covers/71d0c7aa-b728-495d-8b02-158fc8fed09b.jpg" width="110">](https://africanstorybook.org/illustrations/covers/35267.png) |  | Duma says wear a mask! | african_storybook | 38400 | `71d0c7aa-b728-495d-8b02-158fc8fed09b` |

> 유지 추천 없음 — **팀장 판단(해상도 동률 2권)**

## 그룹 63 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/0ec7dceb-698d-4469-8595-83200cacab71.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2023/04/35059-02a526e3718a8a48210b48220f03776d-coverImage.jpeg) |  | Egg | gdl | 660000 | `0ec7dceb-698d-4469-8595-83200cacab71` |
| [<img src="covers/c478f548-1cfd-4ab3-8477-24e4c0abc278.jpg" width="110">](https://zuwbshdvpnranzheswdn.supabase.co/storage/v1/object/public/book-covers/bookdash-egg.webp) | **Y**<br>오디오 보유 | Egg | book_dash | 360000 | `c478f548-1cfd-4ab3-8477-24e4c0abc278` |

## 그룹 64 · 2권 · matched_by=`cover`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/a20ede67-608b-468e-b1f3-bbd82bcb6286.jpg" width="110">](https://africanstorybook.org/illustrations/covers/21004.png) |  | Fana And Her Animals | african_storybook | 38400 | `a20ede67-608b-468e-b1f3-bbd82bcb6286` |
| [<img src="covers/6d1c0d18-21d0-4012-bfc6-db261825ac44.jpg" width="110">](https://africanstorybook.org/illustrations/covers/21396.png) |  | Fana Loves Animals | african_storybook | 38400 | `6d1c0d18-21d0-4012-bfc6-db261825ac44` |

> 유지 추천 없음 — **팀장 판단(해상도 동률 2권)**

## 그룹 65 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/33a49ad1-c210-437f-aa9d-56993bfa43af.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/cara_ediger%40sil-lead.org%2f8f0e7b55-73c4-41b0-9095-65d25ece1f2f%2fbloomdigital%2fSWPB_20_fat-king-thin-dog_Page_02_Image_0001.jpg) |  | Fat King Thin Dog | bloom | 324600 | `33a49ad1-c210-437f-aa9d-56993bfa43af` |
| [<img src="covers/80e15d9a-38a5-4ff1-afdf-b70bd2276424.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2022/06/httpsdigitallibraryio.comwp-contentuploads20201015583-7c82e3c3967af7cd0fc0bc6c6c18d468-203f42d071384a90f2d64cb233e747d5.jpg) | **Y**<br>최대 해상도 | Fat King Thin Dog | gdl | 903378 | `80e15d9a-38a5-4ff1-afdf-b70bd2276424` |

## 그룹 66 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/5f6c5d5c-1c8e-47bc-991c-a0998f71da4c.jpg" width="110">](https://africanstorybook.org/illustrations/covers/36667.png) |  | Fire on the mountain | african_storybook | 38400 | `5f6c5d5c-1c8e-47bc-991c-a0998f71da4c` |
| [<img src="covers/b0283a0b-5836-498f-9086-70e81e7c91c2.jpg" width="110">](https://zuwbshdvpnranzheswdn.supabase.co/storage/v1/object/public/book-covers/asb-32179.png) | **Y**<br>최대 해상도 | Fire on the mountain | african_storybook | 298116 | `b0283a0b-5836-498f-9086-70e81e7c91c2` |

## 그룹 67 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/3cb2f300-24d8-413f-90ab-b7e29ef97d5e.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2022/03/httpsdigitallibrary.iowp-contentuploads20210436534-2d53fe4545becd5d894854649e3e2f40-image_1.jpg) |  | Foxy Joxy Plays a Trick | gdl | 440181 | `3cb2f300-24d8-413f-90ab-b7e29ef97d5e` |
| [<img src="covers/e6fc9794-5ba4-4aa0-b157-1c1ff1d7212a.jpg" width="110">](https://zuwbshdvpnranzheswdn.supabase.co/storage/v1/object/public/book-covers/bookdash-foxy-joxy-plays-a-trick.webp) | **Y**<br>오디오 보유 | Foxy Joxy Plays a Trick | book_dash | 321489 | `e6fc9794-5ba4-4aa0-b157-1c1ff1d7212a` |

## 그룹 68 · 2권 · matched_by=`both`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/3a999f45-8ace-45ac-831a-db5875499c68.jpg" width="110">](https://africanstorybook.org/illustrations/covers/19885.png) |  | Fruits of Freedom | african_storybook | 38400 | `3a999f45-8ace-45ac-831a-db5875499c68` |
| [<img src="covers/ecdc2c27-82ab-4de8-8210-174e83b7731d.jpg" width="110">](https://africanstorybook.org/illustrations/covers/35550.png) |  | Fruits of freedom | african_storybook | 38400 | `ecdc2c27-82ab-4de8-8210-174e83b7731d` |

> 유지 추천 없음 — **팀장 판단(해상도 동률 2권)**

## 그룹 69 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/2af45e9a-421a-4474-816a-f45808ccff89.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/chrisndingu34%40gmail.com%2f1e05b104-7886-4654-829e-29863d35b831%2fbloomdigital%2fGoat%20Dog%20Cow%201.png) | **Y**<br>최대 해상도 | Goat, Dog and Cow | bloom | 518400 | `2af45e9a-421a-4474-816a-f45808ccff89` |
| [<img src="covers/de3e9bf0-066a-4729-a059-11e428830a33.jpg" width="110">](https://africanstorybook.org/illustrations/covers/31498.png) |  | Goat, Dog and Cow | african_storybook | 38400 | `de3e9bf0-066a-4729-a059-11e428830a33` |

## 그룹 70 · 2권 · matched_by=`cover`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/a0b4b09c-1322-4300-9955-a0571c28c320.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2022/03/httpsdigitallibrary.iowp-contentuploads20201014445-7c82e3c3967af7cd0fc0bc6c6c18d468-3ff44ccbcaaff970d87d46d5fd3dd818.jpg) | **Y**<br>최대 해상도 | Grandma's Bananas | gdl | 345600 | `a0b4b09c-1322-4300-9955-a0571c28c320` |
| [<img src="covers/a0e6ead1-6497-49dd-a954-7e71964f3c76.jpg" width="110">](https://africanstorybook.org/illustrations/covers/21792.png) |  | I Learnt A Lesson | african_storybook | 38400 | `a0e6ead1-6497-49dd-a954-7e71964f3c76` |

## 그룹 71 · 2권 · matched_by=`cover`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/bd687d90-1ced-4a40-a939-e40dca3a6176.jpg" width="110">](https://africanstorybook.org/illustrations/covers/19109.png) |  | Grandmother's Stories | african_storybook | 38400 | `bd687d90-1ced-4a40-a939-e40dca3a6176` |
| [<img src="covers/a1a0ebe8-fd75-4e91-84f6-63664a19a92f.jpg" width="110">](https://africanstorybook.org/illustrations/covers/20883.png) |  | Grandmother, Hare And Elephant | african_storybook | 38400 | `a1a0ebe8-fd75-4e91-84f6-63664a19a92f` |

> 유지 추천 없음 — **팀장 판단(해상도 동률 2권)**

## 그룹 72 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/c0ca9816-36ee-433e-8381-1a1d7712fc3f.jpg" width="110">](https://bookdash.github.io/bookdash-books/grandpas-gold/en/images/cover.jpg) | **Y**<br>오디오 보유 | Grandpa's Gold | book_dash | 620944 | `c0ca9816-36ee-433e-8381-1a1d7712fc3f` |
| [<img src="covers/f5c3ab88-f9ad-4c6f-803f-b8adb31d5f12.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2023/04/35279-d05e2c60b94c428e076fbad0f2cc2778-coverImage.png) |  | Grandpa's Gold | gdl | 236610 | `f5c3ab88-f9ad-4c6f-803f-b8adb31d5f12` |

## 그룹 73 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/a07ea78a-8ec2-4ef0-bb5a-44168d7b8882.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/cara_ediger%40sil-lead.org%2fb01521d4-d283-46be-8ebc-91eb93147d16%2fbloomdigital%2fSWPB_57-happy-and-sad-tell-me-now-series_Page_02_Image_0001.png) | **Y**<br>최대 해상도 | Happy and Sad | bloom | 193200 | `a07ea78a-8ec2-4ef0-bb5a-44168d7b8882` |
| [<img src="covers/c697f90d-2eab-4251-b87a-d244f8d6bd86.jpg" width="110">](https://africanstorybook.org/illustrations/covers/1904.png) |  | Happy and Sad | african_storybook | 38400 | `c697f90d-2eab-4251-b87a-d244f8d6bd86` |

## 그룹 74 · 2권 · matched_by=`cover`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/ea8264e3-684d-425a-a3c8-eb0f00536f64.jpg" width="110">](https://africanstorybook.org/illustrations/covers/9796.png) |  | Hare And Hyena | african_storybook | 38400 | `ea8264e3-684d-425a-a3c8-eb0f00536f64` |
| [<img src="covers/80ea6bcc-d82f-4a01-9134-c414abd4a405.jpg" width="110">](https://africanstorybook.org/illustrations/covers/20885.png) |  | Hare And Hyena Grow Crops | african_storybook | 38400 | `80ea6bcc-d82f-4a01-9134-c414abd4a405` |

> 유지 추천 없음 — **팀장 판단(해상도 동률 2권)**

## 그룹 75 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/1619dcb3-b519-4148-a436-62afe2bc597b.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2023/04/35468-d05e2c60b94c428e076fbad0f2cc2778-coverImage.png) |  | Hello | gdl | 240975 | `1619dcb3-b519-4148-a436-62afe2bc597b` |
| [<img src="covers/952a8b40-7487-4259-9d4e-f2c093dff525.jpg" width="110">](https://zuwbshdvpnranzheswdn.supabase.co/storage/v1/object/public/book-covers/bookdash-hello.webp) | **Y**<br>오디오 보유 | Hello | book_dash | 321489 | `952a8b40-7487-4259-9d4e-f2c093dff525` |

## 그룹 76 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/99488d00-a42d-42a1-9572-b6600161e74b.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2023/04/35281-d05e2c60b94c428e076fbad0f2cc2778-coverImage.png) | **Y**<br>최대 해상도 | Helping Mother | gdl | 346500 | `99488d00-a42d-42a1-9572-b6600161e74b` |
| [<img src="covers/3191704c-e927-45f2-afeb-cec04d567cbc.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2022/03/httpsdigitallibrary.iowp-contentuploads20210941114-02a526e3718a8a48210b48220f03776d-coverImage.jpeg) |  | Helping Others | gdl | 298196 | `3191704c-e927-45f2-afeb-cec04d567cbc` |

## 그룹 77 · 2권 · matched_by=`cover`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/29838a6a-f4b7-4294-8ba1-59795bed093c.jpg" width="110">](https://africanstorybook.org/illustrations/covers/21378.png) |  | Henry Had No Home | african_storybook | 38400 | `29838a6a-f4b7-4294-8ba1-59795bed093c` |
| [<img src="covers/14507019-1eeb-4d31-9058-727f2954da99.jpg" width="110">](https://africanstorybook.org/illustrations/covers/14239.png) |  | My Brothers and I | african_storybook | 38400 | `14507019-1eeb-4d31-9058-727f2954da99` |

> 유지 추천 없음 — **팀장 판단(해상도 동률 2권)**

## 그룹 78 · 2권 · matched_by=`cover`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/6bfbb68a-8ffe-4b1f-a289-435553acc8c4.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2022/03/httpsdigitallibrary.iowp-contentuploads20201014531-7c82e3c3967af7cd0fc0bc6c6c18d468-3ff226f4cc0bdad480bbfa8bea945d13.jpg) | **Y**<br>최대 해상도 | Holidays With Grandmother | gdl | 345600 | `6bfbb68a-8ffe-4b1f-a289-435553acc8c4` |
| [<img src="covers/84a59101-ded0-454a-8877-a0a71df94240.jpg" width="110">](https://africanstorybook.org/illustrations/covers/21448.png) |  | Visiting Grandmother | african_storybook | 38400 | `84a59101-ded0-454a-8877-a0a71df94240` |

## 그룹 79 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/9c60ca6d-7112-47cf-a3b1-68f398690cb2.jpg" width="110">](https://africanstorybook.org/illustrations/covers/31637.png) |  | Home Alone | african_storybook | 38400 | `9c60ca6d-7112-47cf-a3b1-68f398690cb2` |
| [<img src="covers/b0a9ccb5-9a7d-42b1-8981-585166bf657f.jpg" width="110">](https://africanstorybook.org/illustrations/covers/22742.png) |  | Home Alone | african_storybook | 38400 | `b0a9ccb5-9a7d-42b1-8981-585166bf657f` |

> 유지 추천 없음 — **팀장 판단(해상도 동률 2권)**

## 그룹 80 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/27c84efc-f68a-4a76-bef1-17acfbcc5a19.jpg" width="110">](https://bookdash.github.io/bookdash-books/how-about-you/en/images/cover.jpg) | **Y**<br>오디오 보유 | How About You? | book_dash | 620944 | `27c84efc-f68a-4a76-bef1-17acfbcc5a19` |
| [<img src="covers/bc724ff7-9115-4974-aa67-f74b7cbd882c.jpg" width="110">](https://africanstorybook.org/illustrations/covers/15340.png) |  | How About You? | african_storybook | 38400 | `bc724ff7-9115-4974-aa67-f74b7cbd882c` |

## 그룹 81 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/24b4eee5-24f6-4f92-8ab2-f70c757c2c19.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/intern%40littlezebrabooks.com%2fb8b72cfb-8922-41c0-a168-a9c6fd299318%2fbloomdigital%2fAnt%201.png) | **Y**<br>최대 해상도 | How Ant Saved Dove | bloom | 358801 | `24b4eee5-24f6-4f92-8ab2-f70c757c2c19` |
| [<img src="covers/8ee81db7-e020-4192-b455-4ed268db462d.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2022/03/httpsdigitallibrary.iowp-contentuploads20201014439-7c82e3c3967af7cd0fc0bc6c6c18d468-b9d81c404a7f7a36a20dc824157799cf.jpg) |  | How Ant Saved Dove | gdl | 345600 | `8ee81db7-e020-4192-b455-4ed268db462d` |

## 그룹 82 · 2권 · matched_by=`both`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/859f618c-1cb2-47a4-b65f-d239f46c5af0.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2022/03/httpsdigitallibrary.iowp-contentuploads20201015839-7c82e3c3967af7cd0fc0bc6c6c18d468-67ca257395978a47098fbccbfefac1a1.jpg) |  | How Do Aeroplanes Fly? | gdl | 441140 | `859f618c-1cb2-47a4-b65f-d239f46c5af0` |
| [<img src="covers/b82ed0b4-7e26-491e-8ade-0817b8b967c7.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2023/04/35101-02a526e3718a8a48210b48220f03776d-coverImage.jpeg) |  | How do Airplanes Fly? | gdl | 441140 | `b82ed0b4-7e26-491e-8ade-0817b8b967c7` |

> 유지 추천 없음 — **팀장 판단(해상도 동률 2권)**

## 그룹 83 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/3cb0279f-e003-4ab8-b0b5-82452bc6735b.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2023/04/35223-02a526e3718a8a48210b48220f03776d-coverImage.jpeg) |  | How Do You Sleep? | gdl | 141834 | `3cb0279f-e003-4ab8-b0b5-82452bc6735b` |
| [<img src="covers/40d0c8d8-4105-4f11-b537-af9f228fc944.jpg" width="110">](https://zuwbshdvpnranzheswdn.supabase.co/storage/v1/object/public/book-covers/bookdash-how-do-you-sleep.webp) | **Y**<br>book_dash | How do you sleep? | book_dash | 360000 | `40d0c8d8-4105-4f11-b537-af9f228fc944` |

## 그룹 84 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/353c8f3d-7933-4b0e-9bd3-0f916f3fee93.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/vsgb9DGb0k%2f1747111713606%2fbloomdigital%2fhow-do-you-want-your-eggs_page2%20%281280p%29.jpg) |  | How do you want your eggs? | bloom | 819200 | `353c8f3d-7933-4b0e-9bd3-0f916f3fee93` |
| [<img src="covers/c00bcc44-4c53-4972-a7a3-15c81082281d.jpg" width="110">](https://zuwbshdvpnranzheswdn.supabase.co/storage/v1/object/public/book-covers/bookdash-how-do-you-want-your-eggs.webp) | **Y**<br>오디오 보유 | How do you want your eggs? | book_dash | 360000 | `c00bcc44-4c53-4972-a7a3-15c81082281d` |

## 그룹 85 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/2dd818e1-4b4f-45eb-8730-d6a7ed40793c.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/3CAbXV6Vr7%2f1765465792648%2fbloomdigital%2fPicture1.jpg) |  | How to Catch the Wind | bloom | 298242 | `2dd818e1-4b4f-45eb-8730-d6a7ed40793c` |
| [<img src="covers/5338ad48-80af-4284-bcb1-041803948193.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/5GlpE461Ib%2f1772777186214%2fbloomdigital%2fPicture2.jpg) | **Y**<br>최대 해상도 | How to Catch the Wind | bloom | 719719 | `5338ad48-80af-4284-bcb1-041803948193` |

## 그룹 86 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/116f5a2b-bc0f-4315-bede-c603b4436ae0.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/e8MeGx4VAe%2f1743855703201%2fbloomdigital%2fhow-to-tame-a-monster_page2%20%281280p%29.jpg) |  | How to Tame a Monster | bloom | 819200 | `116f5a2b-bc0f-4315-bede-c603b4436ae0` |
| [<img src="covers/4bfa8594-c4a7-417e-ab73-b6d29c6e1cf6.jpg" width="110">](https://zuwbshdvpnranzheswdn.supabase.co/storage/v1/object/public/book-covers/bookdash-how-to-tame-a-monster.webp) | **Y**<br>오디오 보유 | How to Tame a Monster | book_dash | 360000 | `4bfa8594-c4a7-417e-ab73-b6d29c6e1cf6` |

## 그룹 87 · 2권 · matched_by=`cover`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/3a6c82ee-dda8-448c-9455-8cd8af26b597.jpg" width="110">](https://africanstorybook.org/illustrations/covers/20155.png) |  | Hyena and Monkey | african_storybook | 38400 | `3a6c82ee-dda8-448c-9455-8cd8af26b597` |
| [<img src="covers/3c548eb3-26c1-4769-9304-98206b16c9d7.jpg" width="110">](https://africanstorybook.org/illustrations/covers/21395.png) |  | Monkey And Hyena | african_storybook | 38400 | `3c548eb3-26c1-4769-9304-98206b16c9d7` |

> 유지 추천 없음 — **팀장 판단(해상도 동률 2권)**

## 그룹 88 · 2권 · matched_by=`cover`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/39bfd8c9-10bb-4111-b8ad-6427973245ac.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/mstr.jg%40gmail.com%2f1f3f6013-b9fc-4652-9637-71291cef5143%2fbloomdigital%2f1%20I%20smell%20%28Large%29.jpg) |  | I Can | bloom | 313800 | `39bfd8c9-10bb-4111-b8ad-6427973245ac` |
| [<img src="covers/e24df248-22a8-4e0c-919b-fb8299a495b3.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/educationforlife%40sil.org%2f6cf3a8db-eed5-40ec-80f1-d686964b2e43%2fbloomdigital%2f1%20I%20smell%20%28Large%29.jpg) |  | I Can Do | bloom | 313800 | `e24df248-22a8-4e0c-919b-fb8299a495b3` |

> 유지 추천 없음 — **팀장 판단(해상도 동률 2권)**

## 그룹 89 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/9740707d-dce8-4132-ac9a-12690d8b3c37.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2022/03/httpsdigitallibrary.iowp-contentuploads20201015609-7c82e3c3967af7cd0fc0bc6c6c18d468-a9ed068608a710f037e63788bcb8cbd9.jpg) | **Y**<br>최대 해상도 | I Can Help! | gdl | 440181 | `9740707d-dce8-4132-ac9a-12690d8b3c37` |
| [<img src="covers/e44bf88a-3f5f-4c05-a737-386bdffa4b4d.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/okuukeremetbooks%40gmail.com%2f43f98ac5-0061-40a5-969e-dbec2f5d6cb4%2fbloomdigital%2fM_PB_10-i-can-help_Page_02_Image_0001.png) |  | I Can Help! | bloom | 171600 | `e44bf88a-3f5f-4c05-a737-386bdffa4b4d` |

## 그룹 90 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/7c9a57c5-155d-46bc-9e39-b46ca851d7d3.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/Mnwi5OU2jI%2f1767769581077%2fbloomdigital%2fSWPB_68-i-can-make-things_Page_02_Image_1.png) | **Y**<br>최대 해상도 | I Can Make Things! | bloom | 782080 | `7c9a57c5-155d-46bc-9e39-b46ca851d7d3` |
| [<img src="covers/8e70dcc7-8424-479e-9816-7a4ee99175a7.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2022/03/httpsdigitallibrary.iowp-contentuploads20201015539-7c82e3c3967af7cd0fc0bc6c6c18d468-62167a3a31cce579b568b6c10270f633.jpg) |  | I Can Make Things! | gdl | 440181 | `8e70dcc7-8424-479e-9816-7a4ee99175a7` |

## 그룹 91 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/1b77f024-7453-4fe9-8882-0294919a27ef.jpg" width="110">](https://africanstorybook.org/illustrations/covers/15363.png) |  | Is There Anyone Like Me? | african_storybook | 38400 | `1b77f024-7453-4fe9-8882-0294919a27ef` |
| [<img src="covers/83029b02-3c43-4984-9b1a-29097fce4cba.jpg" width="110">](https://bookdash.github.io/bookdash-books/is-there-anyone-like-me/en/images/cover.jpg) | **Y**<br>오디오 보유 | Is There Anyone Like Me? | book_dash | 630400 | `83029b02-3c43-4984-9b1a-29097fce4cba` |

## 그룹 92 · 2권 · matched_by=`cover`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/ffc12f0d-ba73-4d91-be53-3c096da1b082.jpg" width="110">](https://africanstorybook.org/illustrations/covers/13025.png) |  | Keeper and His Nursery | african_storybook | 38400 | `ffc12f0d-ba73-4d91-be53-3c096da1b082` |
| [<img src="covers/59fdcac6-e072-408b-93a6-3bcb514c19c1.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2022/03/httpsdigitallibrary.iowp-contentuploads20201014557-7c82e3c3967af7cd0fc0bc6c6c18d468-8c50180efb7633035711b63822eac87c.jpg) | **Y**<br>최대 해상도 | Keeper And His Special Nursery | gdl | 345600 | `59fdcac6-e072-408b-93a6-3bcb514c19c1` |

## 그룹 93 · 2권 · matched_by=`cover`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/5e263dc9-5691-417d-a49d-aa74b8c25d97.jpg" width="110">](https://africanstorybook.org/illustrations/covers/40795.png) |  | Khosi the School Librarian | african_storybook | 38400 | `5e263dc9-5691-417d-a49d-aa74b8c25d97` |
| [<img src="covers/a4747a53-dd60-4716-843f-d1eeada790bd.jpg" width="110">](https://africanstorybook.org/illustrations/covers/22116.png) |  | Things I Do at School | african_storybook | 38400 | `a4747a53-dd60-4716-843f-d1eeada790bd` |

> 유지 추천 없음 — **팀장 판단(해상도 동률 2권)**

## 그룹 94 · 2권 · matched_by=`cover`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/789842ed-4652-481b-b118-cdaf72c4995e.jpg" width="110">](https://africanstorybook.org/illustrations/covers/35213.png) |  | Kids Who Care | african_storybook | 38400 | `789842ed-4652-481b-b118-cdaf72c4995e` |
| [<img src="covers/08a8c5f4-07d9-4240-9d7c-fc1726771191.jpg" width="110">](https://africanstorybook.org/illustrations/covers/35254.png) |  | What can we do? | african_storybook | 38400 | `08a8c5f4-07d9-4240-9d7c-fc1726771191` |

> 유지 추천 없음 — **팀장 판단(해상도 동률 2권)**

## 그룹 95 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/88d6fd63-139b-469c-87da-06ed49f80e72.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2023/04/35011-02a526e3718a8a48210b48220f03776d-coverImage.jpeg) |  | Knight Times | gdl | 360000 | `88d6fd63-139b-469c-87da-06ed49f80e72` |
| [<img src="covers/f50cd955-b36f-469e-8239-e30ff007a629.jpg" width="110">](https://zuwbshdvpnranzheswdn.supabase.co/storage/v1/object/public/book-covers/bookdash-knight-times.webp) | **Y**<br>오디오 보유 | Knight Times | book_dash | 321489 | `f50cd955-b36f-469e-8239-e30ff007a629` |

## 그룹 96 · 2권 · matched_by=`both`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/1252ee12-ec89-4377-8b66-04259aae2b24.jpg" width="110">](https://bookdash.github.io/bookdash-books/lara-the-yellow-ladybird/en/images/cover.jpg) | **Y**<br>오디오 보유 | Lara the Yellow Ladybird | book_dash | 620944 | `1252ee12-ec89-4377-8b66-04259aae2b24` |
| [<img src="covers/46745157-19a0-4bd9-b94d-f2dd3f9a8788.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2023/04/35361-d05e2c60b94c428e076fbad0f2cc2778-coverImage.png) |  | Lara the Yellow Ladybird | gdl | 1412400 | `46745157-19a0-4bd9-b94d-f2dd3f9a8788` |

## 그룹 97 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/54a7b2a4-48d1-4214-a03f-9a88e7a28887.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2023/04/35706-02a526e3718a8a48210b48220f03776d-coverImage.jpeg) |  | Lebo and Gogo's Tea Party | gdl | 785160 | `54a7b2a4-48d1-4214-a03f-9a88e7a28887` |
| [<img src="covers/cf3733f9-5fb2-410a-90a8-2322e25ae2f3.jpg" width="110">](https://zuwbshdvpnranzheswdn.supabase.co/storage/v1/object/public/book-covers/bookdash-lebo-and-gogos-tea-party.webp) | **Y**<br>오디오 보유 | Lebo and Gogo’s Tea Party | book_dash | 360000 | `cf3733f9-5fb2-410a-90a8-2322e25ae2f3` |

## 그룹 98 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/d45be6f3-e462-4b64-8612-860930271929.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2023/04/35415-02a526e3718a8a48210b48220f03776d-coverImage.jpeg) |  | Let's Be Friends | gdl | 2233526 | `d45be6f3-e462-4b64-8612-860930271929` |
| [<img src="covers/a8aa157b-cbd6-4e85-bdec-2fca0a8f0671.jpg" width="110">](https://zuwbshdvpnranzheswdn.supabase.co/storage/v1/object/public/book-covers/bookdash-lets-be-friends.webp) | **Y**<br>오디오 보유 | Let’s be Friends | book_dash | 360000 | `a8aa157b-cbd6-4e85-bdec-2fca0a8f0671` |

## 그룹 99 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/876e79a2-94ad-4ffd-b3b7-1f6402dbc24c.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2022/03/httpsdigitallibrary.iowp-contentuploads20201021531-7c82e3c3967af7cd0fc0bc6c6c18d468-5f3e3d32f815cf193f3c2d08823359cc.jpg) | **Y**<br>최대 해상도 | Let's Fly | gdl | 501760 | `876e79a2-94ad-4ffd-b3b7-1f6402dbc24c` |
| [<img src="covers/79bbf1dc-eec1-4a7a-abde-ccd55a6da314.jpg" width="110">](https://africanstorybook.org/illustrations/covers/37129.png) |  | Let's fly! | african_storybook | 38400 | `79bbf1dc-eec1-4a7a-abde-ccd55a6da314` |

## 그룹 100 · 2권 · matched_by=`cover`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/dc5ebe8d-9d12-45c3-98ab-d10ab4317849.jpg" width="110">](https://africanstorybook.org/illustrations/covers/2134.png) |  | Letter to Mum | african_storybook | 38400 | `dc5ebe8d-9d12-45c3-98ab-d10ab4317849` |
| [<img src="covers/fbd13503-0242-488f-b3e8-6e8b228397dd.jpg" width="110">](https://africanstorybook.org/illustrations/covers/21452.png) |  | Waiting For Baby | african_storybook | 38400 | `fbd13503-0242-488f-b3e8-6e8b228397dd` |

> 유지 추천 없음 — **팀장 판단(해상도 동률 2권)**

## 그룹 101 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/1d657bdc-8960-408b-b4d8-9a8ecf4492e4.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2023/04/35524-02a526e3718a8a48210b48220f03776d-coverImage.jpeg) | **Y**<br>최대 해상도 | Listen to My Body | gdl | 440181 | `1d657bdc-8960-408b-b4d8-9a8ecf4492e4` |
| [<img src="covers/de167412-67fd-4a2a-a5e7-c14faba05983.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/librarian%40bloomlibrary.org%2f46326cbb-ba36-4691-9754-c1585bd0adc2%2fbloomdigital%2fListen%20to%20My%20Body_Page%2002.jpg) |  | Listen to my Body | bloom | 330600 | `de167412-67fd-4a2a-a5e7-c14faba05983` |

## 그룹 102 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/bc79b86e-09c9-4bc4-898f-3653f0cafa45.jpg" width="110">](https://bookdash.github.io/bookdash-books/little-ants-big-plan/en/images/cover.jpg) | **Y**<br>오디오 보유 | Little Ant's Big Plan | book_dash | 2480625 | `bc79b86e-09c9-4bc4-898f-3653f0cafa45` |
| [<img src="covers/ea8959ef-8031-4490-a0d7-c1a7b18e370c.jpg" width="110">](https://africanstorybook.org/illustrations/covers/15459.png) |  | Little Ant's Big Plan | african_storybook | 38400 | `ea8959ef-8031-4490-a0d7-c1a7b18e370c` |

## 그룹 103 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/a58e31bf-f436-4180-bee3-9570b44cc7ee.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/bethann_carlson%40sil.org%2fca4bde0c-7a5b-47a6-9b02-7b7f70afed3a%2fbloomdigital%2fimage.png) | **Y**<br>최대 해상도 | Little Dog | bloom | 270336 | `a58e31bf-f436-4180-bee3-9570b44cc7ee` |
| [<img src="covers/d88111a3-fc33-4b32-8e72-378c24c6a9ea.jpg" width="110">](https://africanstorybook.org/illustrations/covers/2387.png) |  | Little Dog | african_storybook | 38400 | `d88111a3-fc33-4b32-8e72-378c24c6a9ea` |

## 그룹 104 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/1d128e9d-5313-4fc9-a555-3ad2d4743e0f.jpg" width="110">](https://zuwbshdvpnranzheswdn.supabase.co/storage/v1/object/public/book-covers/bookdash-little-goat.webp) | **Y**<br>book_dash | Little Goat | book_dash | 321489 | `1d128e9d-5313-4fc9-a555-3ad2d4743e0f` |
| [<img src="covers/42f00bf9-eab1-4cb4-99e7-f94cab7b25e4.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2023/04/34798-d05e2c60b94c428e076fbad0f2cc2778-coverImage.png) |  | Little Goat | gdl | 157896 | `42f00bf9-eab1-4cb4-99e7-f94cab7b25e4` |

## 그룹 105 · 2권 · matched_by=`both`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/6beab748-117c-4f5b-9c76-eeb7bd556d1f.jpg" width="110">](https://africanstorybook.org/illustrations/covers/20147.png) |  | Little Jojo's Long Tall Tale | african_storybook | 38400 | `6beab748-117c-4f5b-9c76-eeb7bd556d1f` |
| [<img src="covers/9ce14d9c-44b4-4028-abf2-22642fbe9f07.jpg" width="110">](https://africanstorybook.org/illustrations/covers/19923.png) |  | Little Jojo's Long Tall Tale | african_storybook | 38400 | `9ce14d9c-44b4-4028-abf2-22642fbe9f07` |

> 유지 추천 없음 — **팀장 판단(해상도 동률 2권)**

## 그룹 106 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/29d0d46a-6d8c-4793-93da-43789f143ab3.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/okuukeremetbooks%40gmail.com%2f5e6546b9-dea5-4d32-80dd-ce5e29fb0b35%2fbloomdigital%2fimage1.jpg) |  | Little Painters | bloom | 324600 | `29d0d46a-6d8c-4793-93da-43789f143ab3` |
| [<img src="covers/6001f88c-4de1-43c5-b8b8-aeb80fc8754d.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2022/03/httpsdigitallibrary.iowp-contentuploads20201015459-7c82e3c3967af7cd0fc0bc6c6c18d468-960a52edbe1f105afbada160eef53e45.jpg) | **Y**<br>최대 해상도 | Little Painters | gdl | 906255 | `6001f88c-4de1-43c5-b8b8-aeb80fc8754d` |

## 그룹 107 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/cdd9dc87-2303-4542-9b28-9d3a3eafa94f.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2023/04/35417-02a526e3718a8a48210b48220f03776d-coverImage.jpeg) |  | Look out, Luthando | gdl | 5579044 | `cdd9dc87-2303-4542-9b28-9d3a3eafa94f` |
| [<img src="covers/4fd1c428-bf99-47b0-9da0-26161c91cd4c.jpg" width="110">](https://zuwbshdvpnranzheswdn.supabase.co/storage/v1/object/public/book-covers/bookdash-look-out-luthando.webp) | **Y**<br>오디오 보유 | Look out, Luthando! | book_dash | 360000 | `4fd1c428-bf99-47b0-9da0-26161c91cd4c` |

## 그룹 108 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/bc6ccfd8-f790-40c5-ac4e-74392d830b4e.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2023/04/34682-02a526e3718a8a48210b48220f03776d-coverImage.jpeg) |  | Look Up | gdl | 421001 | `bc6ccfd8-f790-40c5-ac4e-74392d830b4e` |
| [<img src="covers/0cb08289-1f83-4070-bd84-ab447c1ae6cd.jpg" width="110">](https://zuwbshdvpnranzheswdn.supabase.co/storage/v1/object/public/book-covers/bookdash-look-up.webp) | **Y**<br>book_dash | Look up! | book_dash | 360000 | `0cb08289-1f83-4070-bd84-ab447c1ae6cd` |

## 그룹 109 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/b00a5b46-7616-4373-a9a7-58c1b176c386.jpg" width="110">](https://bookdash.github.io/bookdash-books/lory-dory/en/images/cover.jpg) | **Y**<br>오디오 보유 | Lory Dory | book_dash | 5583769 | `b00a5b46-7616-4373-a9a7-58c1b176c386` |
| [<img src="covers/ec546d5e-90ef-4a9d-9c91-9abc201d808d.jpg" width="110">](https://africanstorybook.org/illustrations/covers/15523.png) |  | Lory Dory | african_storybook | 38400 | `ec546d5e-90ef-4a9d-9c91-9abc201d808d` |

## 그룹 110 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/716f8b16-3b8c-457e-bbd5-3fc6c8e4f228.jpg" width="110">](https://africanstorybook.org/illustrations/covers/24580.png) |  | Losing my mother | african_storybook | 38400 | `716f8b16-3b8c-457e-bbd5-3fc6c8e4f228` |
| [<img src="covers/af924b5f-c8ea-4ede-ae83-6f37a440277a.jpg" width="110">](https://africanstorybook.org/illustrations/covers/32049.png) |  | Losing my mother | african_storybook | 38400 | `af924b5f-c8ea-4ede-ae83-6f37a440277a` |

> 유지 추천 없음 — **팀장 판단(해상도 동률 2권)**

## 그룹 111 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/92ff2e4b-2f51-4d7b-bfc3-d88b762ae52e.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2023/04/35397-02a526e3718a8a48210b48220f03776d-coverImage.jpeg) |  | Lost and Found | gdl | 157896 | `92ff2e4b-2f51-4d7b-bfc3-d88b762ae52e` |
| [<img src="covers/fb98c905-9a71-4d1f-a327-f29b41288f80.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/cara_ediger%40sil-lead.org%2f6c0fbc11-808d-4c80-93b0-6dea501c0809%2fbloomdigital%2fSWPB_7_lost-and-found_Page_02_Image_0001.png) | **Y**<br>최대 해상도 | Lost and Found | bloom | 171600 | `fb98c905-9a71-4d1f-a327-f29b41288f80` |

## 그룹 112 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/0c1d19fe-f40c-4b5f-8bfb-65d5526e4a0c.jpg" width="110">](https://bookdash.github.io/bookdash-books/maddy-moona/en/images/cover.jpg) | **Y**<br>오디오 보유 | Maddy Moona's Menagerie | book_dash | 610700 | `0c1d19fe-f40c-4b5f-8bfb-65d5526e4a0c` |
| [<img src="covers/43f338bd-36a8-44a1-9f84-0e82902b07d1.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2023/04/36159-02a526e3718a8a48210b48220f03776d-coverImage.jpeg) |  | Maddy Moona’s Menagerie | gdl | 204750 | `43f338bd-36a8-44a1-9f84-0e82902b07d1` |

## 그룹 113 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/0f74581b-05d4-4e98-9ab5-51418f331774.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/ByEnXdfdD0%2f1774439935608%2fbloomdigital%2f503%20%283%29.png) |  | Meet More Family. Phase 1, Unit 5, Game 5B Mvskoke Growing Bilingual Community | bloom | 696711 | `0f74581b-05d4-4e98-9ab5-51418f331774` |
| [<img src="covers/aa250fc3-be01-4185-b6e0-d9965944bb3f.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/TRf7cMtbtW%2f1760473910423%2fbloomdigital%2fCover%2C%20Kinship1.png) | **Y**<br>최대 해상도 | Meet the Family Phase 1, Unit 5, Game 5 Mvskoke Growing Bilingual Community | bloom | 719000 | `aa250fc3-be01-4185-b6e0-d9965944bb3f` |

## 그룹 114 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/a8ee34b2-3b55-407b-9630-c91e3acf3e0e.jpg" width="110">](https://bookdash.github.io/bookdash-books/miss-helens-magical-world/en/images/cover.jpg) | **Y**<br>오디오 보유 | Miss Helen's Magical World | book_dash | 620944 | `a8ee34b2-3b55-407b-9630-c91e3acf3e0e` |
| [<img src="covers/25553f8a-e7b0-4aab-b6ad-ad572162cb00.jpg" width="110">](https://africanstorybook.org/illustrations/covers/8907.png) |  | Miss Helen’S Magical World | african_storybook | 38400 | `25553f8a-e7b0-4aab-b6ad-ad572162cb00` |

## 그룹 115 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/0c2d62fa-054c-4f3a-901a-86eb4933fab1.jpg" width="110">](https://zuwbshdvpnranzheswdn.supabase.co/storage/v1/object/public/book-covers/bookdash-mud.webp) | **Y**<br>오디오 보유 | MUD! | book_dash | 360000 | `0c2d62fa-054c-4f3a-901a-86eb4933fab1` |
| [<img src="covers/b62bfe7b-7f91-48d4-b5ca-06531de7754a.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/vCYksr4857%2f1747184031143%2fbloomdigital%2fmud_page3.jpg) |  | MUD! | bloom | 819200 | `b62bfe7b-7f91-48d4-b5ca-06531de7754a` |

## 그룹 116 · 2권 · matched_by=`both`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/386628e1-1d9f-4b48-9cb0-62f256166277.jpg" width="110">](https://africanstorybook.org/illustrations/covers/9668.png) |  | My Baby Boy | african_storybook | 38400 | `386628e1-1d9f-4b48-9cb0-62f256166277` |
| [<img src="covers/8be8b3d1-cda2-49db-8b85-0bad894e3cdf.jpg" width="110">](https://africanstorybook.org/illustrations/covers/10142.png) |  | My Baby Boy. | african_storybook | 38400 | `8be8b3d1-cda2-49db-8b85-0bad894e3cdf` |

> 유지 추천 없음 — **팀장 판단(해상도 동률 2권)**

## 그룹 117 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/2a5da6b4-6cc9-42cf-ba53-c680f15f2b02.jpg" width="110">](https://africanstorybook.org/illustrations/covers/24617.png) |  | My first day at school | african_storybook | 38400 | `2a5da6b4-6cc9-42cf-ba53-c680f15f2b02` |
| [<img src="covers/f1d0568a-cf50-46ed-823a-4730207d2557.jpg" width="110">](https://africanstorybook.org/illustrations/covers/24018.png) |  | My first day at school | african_storybook | 38400 | `f1d0568a-cf50-46ed-823a-4730207d2557` |

> 유지 추천 없음 — **팀장 판단(해상도 동률 2권)**

## 그룹 118 · 2권 · matched_by=`both`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/2d0a0b08-b138-4eaa-940a-60eeaaf9b153.jpg" width="110">](https://africanstorybook.org/illustrations/covers/21786.png) |  | My Friend, My Enemy | african_storybook | 38400 | `2d0a0b08-b138-4eaa-940a-60eeaaf9b153` |
| [<img src="covers/db8c7fc1-130b-43f8-9c7b-98db4850c36b.jpg" width="110">](https://africanstorybook.org/illustrations/covers/36064.png) |  | My friend, my enemy | african_storybook | 38400 | `db8c7fc1-130b-43f8-9c7b-98db4850c36b` |

> 유지 추천 없음 — **팀장 판단(해상도 동률 2권)**

## 그룹 119 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/5d3f4bf4-32a9-4ab3-9af3-174c112b8b0f.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2023/04/34804-02a526e3718a8a48210b48220f03776d-coverImage.jpeg) |  | My Friends | gdl | 157896 | `5d3f4bf4-32a9-4ab3-9af3-174c112b8b0f` |
| [<img src="covers/add64ba2-8b81-4e70-9644-2da074293485.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/nFin7fIWFL%2f1767611282486%2fbloomdigital%2fSWPB_77-my-friends_Page_02_Image_1.png) | **Y**<br>최대 해상도 | My Friends | bloom | 880640 | `add64ba2-8b81-4e70-9644-2da074293485` |

## 그룹 120 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/27dc97a7-d6b4-4996-afdd-7969cf37d7bd.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2022/03/httpsdigitallibrary.iowp-contentuploads20201014467-7c82e3c3967af7cd0fc0bc6c6c18d468-228eda8c4e1bbe488906812c95b1387b.jpg) |  | No Pigs Allowed | gdl | 345600 | `27dc97a7-d6b4-4996-afdd-7969cf37d7bd` |
| [<img src="covers/405a6862-2189-498e-9cbc-fb1f15060434.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/intern%40littlezebrabooks.com%2f9dace09b-04f4-4a5a-9787-c25544ab4046%2fbloomdigital%2fNo%20Pigs%201.png) | **Y**<br>최대 해상도 | No Pigs Allowed | bloom | 360000 | `405a6862-2189-498e-9cbc-fb1f15060434` |

## 그룹 121 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/00e8d280-7b14-4bda-ab1c-a8943eefa763.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2023/04/35275-02a526e3718a8a48210b48220f03776d-coverImage.jpeg) |  | Noisy Crows | gdl | 473224 | `00e8d280-7b14-4bda-ab1c-a8943eefa763` |
| [<img src="covers/83a8d5f8-9dc4-4b98-89e8-65452a72df00.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/tFoONFPawq%2f1767613385808%2fbloomdigital%2fSWPB_117-noisy-crows_Page_02_Image_111.png) | **Y**<br>최대 해상도 | Noisy Crows | bloom | 887626 | `83a8d5f8-9dc4-4b98-89e8-65452a72df00` |

## 그룹 122 · 2권 · matched_by=`cover`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/f70139ec-ba3b-4168-8317-36633d2ec977.jpg" width="110">](https://africanstorybook.org/illustrations/covers/7734.png) |  | Rabbit Under the Tree | african_storybook | 38400 | `f70139ec-ba3b-4168-8317-36633d2ec977` |
| [<img src="covers/4d92c034-3e13-4dd6-94d8-f32e4c3a9e85.jpg" width="110">](https://africanstorybook.org/illustrations/covers/20888.png) |  | Run Rabbit Run! | african_storybook | 38400 | `4d92c034-3e13-4dd6-94d8-f32e4c3a9e85` |

> 유지 추천 없음 — **팀장 판단(해상도 동률 2권)**

## 그룹 123 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/588f10b2-7f91-49ea-9fe7-8042c25e6429.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/lumimaftei%40gmail.com%2f7edab369-1311-40fa-acba-3c3d7c23a9ce%2fbloomdigital%2fSWPB_115-rain-rain_Page_02_Image_00011.jpg) |  | Rain, Rain | bloom | 219833 | `588f10b2-7f91-49ea-9fe7-8042c25e6429` |
| [<img src="covers/91ca475a-2820-4e18-b37a-c3ba01a0684b.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2022/03/httpsdigitallibrary.iowp-contentuploads20201015633-7c82e3c3967af7cd0fc0bc6c6c18d468-16a5b7e68a5ee0ec23344d788b44f46d.jpg) | **Y**<br>최대 해상도 | Rain, Rain | gdl | 440181 | `91ca475a-2820-4e18-b37a-c3ba01a0684b` |

## 그룹 124 · 2권 · matched_by=`both`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/09667119-2bc8-4e61-831a-67b1a0985c25.jpg" width="110">](https://africanstorybook.org/illustrations/covers/23938.png) |  | Result of famine | african_storybook | 38400 | `09667119-2bc8-4e61-831a-67b1a0985c25` |
| [<img src="covers/33e3511c-1d90-42bd-abb6-fcdf93f8e066.jpg" width="110">](https://africanstorybook.org/illustrations/covers/23170.png) |  | Result of famine | african_storybook | 38400 | `33e3511c-1d90-42bd-abb6-fcdf93f8e066` |

> 유지 추천 없음 — **팀장 판단(해상도 동률 2권)**

## 그룹 125 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/67704acc-039e-4e3d-badb-752dd03a0634.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2023/04/34948-02a526e3718a8a48210b48220f03776d-coverImage.jpeg) | **Y**<br>최대 해상도 | Rimi's Red Book | gdl | 440271 | `67704acc-039e-4e3d-badb-752dd03a0634` |
| [<img src="covers/17fe05c6-a393-4bcb-ac54-01fe189266cb.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2022/03/httpsdigitallibrary.iowp-contentuploads20201021149-7c82e3c3967af7cd0fc0bc6c6c18d468-60414d21d8ac035ae3006223b2707fc4.jpg) |  | Rimis Red Book | gdl | 440181 | `17fe05c6-a393-4bcb-ac54-01fe189266cb` |

## 그룹 126 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/4fd38ba5-cc25-466b-bfff-4dd735dcdad8.jpg" width="110">](https://africanstorybook.org/illustrations/covers/32920.png) |  | Salemka'an spends her day with wind | african_storybook | 38400 | `4fd38ba5-cc25-466b-bfff-4dd735dcdad8` |
| [<img src="covers/d014cede-54d3-434d-b00f-5e92dab9b37a.jpg" width="110">](https://africanstorybook.org/illustrations/covers/24754.png) |  | Salemka'an spends her day with wind | african_storybook | 38400 | `d014cede-54d3-434d-b00f-5e92dab9b37a` |

> 유지 추천 없음 — **팀장 판단(해상도 동률 2권)**

## 그룹 127 · 2권 · matched_by=`cover`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/8dce9633-5fd0-424e-b665-c0cd9e2caff1.jpg" width="110">](https://africanstorybook.org/illustrations/covers/21788.png) |  | Saying Thank You! | african_storybook | 38400 | `8dce9633-5fd0-424e-b665-c0cd9e2caff1` |
| [<img src="covers/454aff3b-6deb-4aca-96ef-04bbcfe2f5cf.jpg" width="110">](https://africanstorybook.org/illustrations/covers/21394.png) |  | Who Was Grateful? | african_storybook | 38400 | `454aff3b-6deb-4aca-96ef-04bbcfe2f5cf` |

> 유지 추천 없음 — **팀장 판단(해상도 동률 2권)**

## 그룹 128 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/120b3f23-0c19-4015-93c6-b813f8751366.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/okuukeremetbooks%40gmail.com%2f68b95512-d7ca-4520-8201-8225f342d018%2fbloomdigital%2fimage121.png) |  | Scared Tumi | bloom | 243600 | `120b3f23-0c19-4015-93c6-b813f8751366` |
| [<img src="covers/ae24c5e9-4f8c-4904-b478-3b85e7673dfb.jpg" width="110">](https://zuwbshdvpnranzheswdn.supabase.co/storage/v1/object/public/book-covers/bookdash-scared-tumi.webp) | **Y**<br>오디오 보유 | Scared Tumi | book_dash | 360000 | `ae24c5e9-4f8c-4904-b478-3b85e7673dfb` |

## 그룹 129 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/3a754c56-7d6a-4fac-868f-10f28a0f4b1c.jpg" width="110">](https://africanstorybook.org/illustrations/covers/16510.png) |  | Share It Fair! | african_storybook | 38400 | `3a754c56-7d6a-4fac-868f-10f28a0f4b1c` |
| [<img src="covers/d22d86ca-1907-45a0-a459-352b82ab1ecb.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2022/03/httpsdigitallibrary.iowp-contentuploads20210436878-2d53fe4545becd5d894854649e3e2f40-image_1.jpg) | **Y**<br>최대 해상도 | Share it Fair! | gdl | 440181 | `d22d86ca-1907-45a0-a459-352b82ab1ecb` |

## 그룹 130 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/a202b4da-f27e-4af2-bde5-6ae05de39d69.jpg" width="110">](https://zuwbshdvpnranzheswdn.supabase.co/storage/v1/object/public/book-covers/bookdash-shhhhh.webp) | **Y**<br>book_dash | Shhhhh! | book_dash | 360000 | `a202b4da-f27e-4af2-bde5-6ae05de39d69` |
| [<img src="covers/afcfab79-101e-41b8-8256-35fa3605c92e.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2023/04/35065-02a526e3718a8a48210b48220f03776d-coverImage.jpeg) |  | Shhhhh! | gdl | 582607 | `afcfab79-101e-41b8-8256-35fa3605c92e` |

## 그룹 131 · 2권 · matched_by=`cover`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/e3b3c3a0-eeac-472d-b45f-8a823a7a2bc5.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2022/03/httpsdigitallibrary.iowp-contentuploads20201015931-7c82e3c3967af7cd0fc0bc6c6c18d468-707990fb8e2fd28034dce1bae0d463de.jpg) |  | Sister Where Does the Sun Go at Night? | gdl | 905296 | `e3b3c3a0-eeac-472d-b45f-8a823a7a2bc5` |
| [<img src="covers/165a0db8-edef-4af6-865f-530bc28b7e9f.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2023/04/36152-02a526e3718a8a48210b48220f03776d-coverImage.jpeg) |  | Sister! Sister! Where Does the Sun Go at Night? | gdl | 905296 | `165a0db8-edef-4af6-865f-530bc28b7e9f` |

> 유지 추천 없음 — **팀장 판단(해상도 동률 2권)**

## 그룹 132 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/25866d95-5b6c-43f2-912d-845a0f851489.jpg" width="110">](https://africanstorybook.org/illustrations/covers/8978.png) |  | Sizwe's Smile | african_storybook | 38400 | `25866d95-5b6c-43f2-912d-845a0f851489` |
| [<img src="covers/bf1cb69a-e1bf-4682-bdbf-c26422073983.jpg" width="110">](https://bookdash.github.io/bookdash-books/sizwes-smile/en/images/cover.jpg) | **Y**<br>오디오 보유 | Sizwe's Smile | book_dash | 620944 | `bf1cb69a-e1bf-4682-bdbf-c26422073983` |

## 그룹 133 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/3eeac8ec-6dd8-4b57-b61b-e79af2c5f991.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/dkarimova%40ueep.rti.org%2ff434f1f2-d9d6-4ce3-bd52-716faee82a65%2fbloomdigital%2fimage2.png) |  | Small Bird's BIG Adventure | bloom | 360000 | `3eeac8ec-6dd8-4b57-b61b-e79af2c5f991` |
| [<img src="covers/aa1ec813-f9b6-4eda-a28d-2b9d3517f191.jpg" width="110">](https://zuwbshdvpnranzheswdn.supabase.co/storage/v1/object/public/book-covers/bookdash-small-birds-big-adventure.webp) | **Y**<br>오디오 보유 | Small Bird’s Big Adventure | book_dash | 321489 | `aa1ec813-f9b6-4eda-a28d-2b9d3517f191` |

## 그룹 134 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/7b80e0fc-0a94-47d3-bb8d-26c82901f498.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2022/03/httpsdigitallibrary.iowp-contentuploads20201015791-7c82e3c3967af7cd0fc0bc6c6c18d468-e95ceed0c86ffcb0296f0b19aeaae54d.jpg) | **Y**<br>최대 해상도 | Sniffles the Crocodile and Punch the Butterfly | gdl | 440181 | `7b80e0fc-0a94-47d3-bb8d-26c82901f498` |
| [<img src="covers/c6209430-b237-4d0c-b6bb-ed764563e3a1.jpg" width="110">](https://africanstorybook.org/illustrations/covers/2940.png) |  | Sniffles the Crocodile and Punch the Butterfly | african_storybook | 38400 | `c6209430-b237-4d0c-b6bb-ed764563e3a1` |

## 그룹 135 · 2권 · matched_by=`both`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/1d472d72-745a-491b-8125-b65786868376.jpg" width="110">](https://africanstorybook.org/illustrations/covers/2605.png) |  | The Baboons That Went This Way and That | african_storybook | 38400 | `1d472d72-745a-491b-8125-b65786868376` |
| [<img src="covers/dc04b505-c15b-42f5-b964-d04b8b1b7912.jpg" width="110">](https://africanstorybook.org/illustrations/covers/2609.png) |  | The Baboons That Went This Way and That | african_storybook | 38400 | `dc04b505-c15b-42f5-b964-d04b8b1b7912` |

> 유지 추천 없음 — **팀장 판단(해상도 동률 2권)**

## 그룹 136 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/12387fa9-666c-452a-93a8-5e3bd1f5b8e5.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2023/04/35437-02a526e3718a8a48210b48220f03776d-coverImage.jpeg) |  | The Best Nest | gdl | 320400 | `12387fa9-666c-452a-93a8-5e3bd1f5b8e5` |
| [<img src="covers/52c0a717-7afc-41cc-9a3e-b947f0f1c376.jpg" width="110">](https://zuwbshdvpnranzheswdn.supabase.co/storage/v1/object/public/book-covers/bookdash-the-best-nest.webp) | **Y**<br>오디오 보유 | The Best Nest | book_dash | 360000 | `52c0a717-7afc-41cc-9a3e-b947f0f1c376` |

## 그룹 137 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/d6ab2a25-4550-43f5-8d8c-39ec133b52f2.jpg" width="110">](https://zuwbshdvpnranzheswdn.supabase.co/storage/v1/object/public/book-covers/bookdash-the-box.webp) | **Y**<br>book_dash | The Box | book_dash | 360000 | `d6ab2a25-4550-43f5-8d8c-39ec133b52f2` |
| [<img src="covers/fb5359bc-5c00-4256-89a8-9ef935799e98.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2023/04/35005-02a526e3718a8a48210b48220f03776d-coverImage.jpeg) |  | The Box | gdl | 58555 | `fb5359bc-5c00-4256-89a8-9ef935799e98` |

## 그룹 138 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/97f8e962-d3f8-4b3b-b4af-31770bf027d3.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/okuukeremetbooks%40gmail.com%2f8cbf55b5-c0de-490c-84c4-d3dc73bf34cc%2fbloomdigital%2fASP_101_day_the_sun_went_away_0_Page_02_Image_0001.png) | **Y**<br>최대 해상도 | The day the Sun went away | bloom | 358801 | `97f8e962-d3f8-4b3b-b4af-31770bf027d3` |
| [<img src="covers/f7c754cf-047a-4fb9-ac3b-3601e1ca036c.jpg" width="110">](https://africanstorybook.org/illustrations/covers/14771.png) |  | The Day the Sun Went Away | african_storybook | 38400 | `f7c754cf-047a-4fb9-ac3b-3601e1ca036c` |

## 그룹 139 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/12199f9d-e094-4440-a958-3168cf5417d8.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/hD8Ho8eNdv%2f1753294859695%2fbloomdigital%2fPsalm%2023-7.png) | **Y**<br>최대 해상도 | The Lord is My Shepherd | bloom | 836466 | `12199f9d-e094-4440-a958-3168cf5417d8` |
| [<img src="covers/6f2ff944-ffd5-42cd-9d00-dcd6a1af93dc.jpg" width="110">](https://africanstorybook.org/illustrations/covers/32352.png) |  | The Lord is My Shepherd | african_storybook | 38400 | `6f2ff944-ffd5-42cd-9d00-dcd6a1af93dc` |

## 그룹 140 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/8c712417-f726-414c-860a-accf1595e96d.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2023/04/35558-02a526e3718a8a48210b48220f03776d-coverImage.jpeg) | **Y**<br>최대 해상도 | The Race | gdl | 184016 | `8c712417-f726-414c-860a-accf1595e96d` |
| [<img src="covers/df155c4f-f6ff-4e09-a772-721a7b4fde00.jpg" width="110">](https://africanstorybook.org/illustrations/covers/9299.png) |  | The Race | african_storybook | 38400 | `df155c4f-f6ff-4e09-a772-721a7b4fde00` |

## 그룹 141 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/57eadf0f-e621-498d-8ae7-d01f78f49071.jpg" width="110">](https://zuwbshdvpnranzheswdn.supabase.co/storage/v1/object/public/book-covers/bookdash-the-rainbow-cloud.webp) | **Y**<br>book_dash | The Rainbow Cloud | book_dash | 321489 | `57eadf0f-e621-498d-8ae7-d01f78f49071` |
| [<img src="covers/fff653a2-3ef2-4f72-8ee3-725eb4e8b7a2.jpg" width="110">](https://africanstorybook.org/illustrations/covers/20579.png) |  | The Rainbow Cloud | african_storybook | 38400 | `fff653a2-3ef2-4f72-8ee3-725eb4e8b7a2` |

## 그룹 142 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/5f328534-f027-44be-ab80-5168182ebe63.jpg" width="110">](https://africanstorybook.org/illustrations/covers/15838.png) |  | The Rich Fool | african_storybook | 38400 | `5f328534-f027-44be-ab80-5168182ebe63` |
| [<img src="covers/a240fd0a-137f-425a-8949-3c5380def49d.jpg" width="110">](https://africanstorybook.org/illustrations/covers/31542.png) |  | The Rich Fool | african_storybook | 38400 | `a240fd0a-137f-425a-8949-3c5380def49d` |

> 유지 추천 없음 — **팀장 판단(해상도 동률 2권)**

## 그룹 143 · 2권 · matched_by=`both`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/6460a2b4-baff-4480-9846-92bb643b9652.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/7YWHmKnmy5%2f1780245121490%2fbloomdigital%2fimage.jpg) |  | The Three Little Kittens | bloom | 370901 | `6460a2b4-baff-4480-9846-92bb643b9652` |
| [<img src="covers/aabe62b8-ec5e-4567-ac74-b0a806789470.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2022/03/httpsdigitallibrary.iowp-contentuploads20201021045-7c82e3c3967af7cd0fc0bc6c6c18d468-3fe646a61627e3019e5bc3d65dbb0a1f.jpg) | **Y**<br>최대 해상도 | The Three Little Kittens | gdl | 440181 | `aabe62b8-ec5e-4567-ac74-b0a806789470` |

## 그룹 144 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/72debae3-48eb-4f20-be54-c4933527c653.jpg" width="110">](https://africanstorybook.org/illustrations/covers/2716.png) |  | The Tree That Saved the Village of Ombalantu | african_storybook | 38400 | `72debae3-48eb-4f20-be54-c4933527c653` |
| [<img src="covers/b90ac900-6fb8-4f74-abd6-740956e31f99.jpg" width="110">](https://africanstorybook.org/illustrations/covers/2724.png) |  | The Tree That Saved the Village of Ombalantu | african_storybook | 38400 | `b90ac900-6fb8-4f74-abd6-740956e31f99` |

> 유지 추천 없음 — **팀장 판단(해상도 동률 2권)**

## 그룹 145 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/a9a70a16-fdb8-4e91-8baa-ec2670e5cf7b.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/bethann_carlson%40sil.org%2f6e57e9aa-063f-463d-ad3a-9df3e6e31da7%2fbloomdigital%2fASP_291_Things_we_can_do_Page_01_Image_0001.png) |  | Things we Can Do | bloom | 261000 | `a9a70a16-fdb8-4e91-8baa-ec2670e5cf7b` |
| [<img src="covers/f23b5ca4-9265-4e85-859d-ee7dc6f7ba22.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/bethann_carlson%40sil.org%2fdf927817-5ffe-4f14-ac97-13a96b408b22%2fbloomdigital%2fASP_291_Things_we_can_do_Page_02_Image_0001.png) | **Y**<br>최대 해상도 | Things we Can Do | bloom | 265200 | `f23b5ca4-9265-4e85-859d-ee7dc6f7ba22` |

## 그룹 146 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/2523a201-3606-4b02-91cc-290042580f3c.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2023/04/34762-02a526e3718a8a48210b48220f03776d-coverImage.jpeg) | **Y**<br>최대 해상도 | This and That | gdl | 440181 | `2523a201-3606-4b02-91cc-290042580f3c` |
| [<img src="covers/42253224-e384-4faf-991b-cfc087e7f612.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/librarian%40bloomlibrary.org%2f6c784ea2-cfa2-4246-b1a3-c78401dc3a37%2fbloomdigital%2fSWPB_228-this-and-that_Page_02_Image_0001.png) |  | This and That | bloom | 193200 | `42253224-e384-4faf-991b-cfc087e7f612` |

## 그룹 147 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/c6ebf5c0-46f9-407a-a0bf-d0033ba0b6e8.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2023/04/34830-02a526e3718a8a48210b48220f03776d-coverImage.jpeg) |  | Tikky! Boom! Tish! | gdl | 126060 | `c6ebf5c0-46f9-407a-a0bf-d0033ba0b6e8` |
| [<img src="covers/d66510fc-0cef-4a91-bf52-696a4ebb1ff4.jpg" width="110">](https://zuwbshdvpnranzheswdn.supabase.co/storage/v1/object/public/book-covers/bookdash-tikky-boom-tish.webp) | **Y**<br>오디오 보유 | Tikky! Boom! Tish! | book_dash | 360000 | `d66510fc-0cef-4a91-bf52-696a4ebb1ff4` |

## 그룹 148 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/1120dbb4-ffcf-4ccf-80d6-c8fa7dacd9dd.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/okuukeremetbooks%40gmail.com%2f25ce9a8d-58d0-4577-838e-46fa897822ae%2fbloomdigital%2f411-girl-and-pet-dog.jpg) |  | Timmy and Pepe | bloom | 171314 | `1120dbb4-ffcf-4ccf-80d6-c8fa7dacd9dd` |
| [<img src="covers/bdd78464-cdc9-47f5-9225-848c1d67218b.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/okuukeremetbooks%40gmail.com%2fa4fb7830-77c8-4022-af2a-2c7672f7d20b%2fbloomdigital%2f412-girl-with-dog1.jpg) | **Y**<br>최대 해상도 | Timmy and Pepe | bloom | 192878 | `bdd78464-cdc9-47f5-9225-848c1d67218b` |

## 그룹 149 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/bbc90a08-3cca-4e34-8c98-54234917e04b.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2023/04/34943-d05e2c60b94c428e076fbad0f2cc2778-coverImage.png) |  | Tone's Big Drop | gdl | 240975 | `bbc90a08-3cca-4e34-8c98-54234917e04b` |
| [<img src="covers/6db82984-8673-4b0f-aafb-662c40a71398.jpg" width="110">](https://zuwbshdvpnranzheswdn.supabase.co/storage/v1/object/public/book-covers/bookdash-tones-big-drop.webp) | **Y**<br>오디오 보유 | Tone’s Big Drop | book_dash | 321489 | `6db82984-8673-4b0f-aafb-662c40a71398` |

## 그룹 150 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/31e3c5bb-d381-48d9-8efb-4453c98c32c6.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/HR29rbSUlL%2f1760347315887%2fbloomdigital%2fPicture2.jpg) | **Y**<br>최대 해상도 | Too Big! Too Small! | bloom | 480960 | `31e3c5bb-d381-48d9-8efb-4453c98c32c6` |
| [<img src="covers/7483dd9a-30ae-42db-bcf9-1a8c42117f1d.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2023/04/34750-02a526e3718a8a48210b48220f03776d-coverImage.jpeg) |  | Too Big, Too Small | gdl | 440181 | `7483dd9a-30ae-42db-bcf9-1a8c42117f1d` |

## 그룹 151 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/f5f9e055-ce9a-4eb9-bcbe-056ddc7deed5.jpg" width="110">](https://bookdash.github.io/bookdash-books/tortoise-finds-his-home/en/images/cover.jpg) | **Y**<br>오디오 보유 | Tortoise Finds His Home | book_dash | 2480625 | `f5f9e055-ce9a-4eb9-bcbe-056ddc7deed5` |
| [<img src="covers/8b6cc55e-93f3-4844-80ab-fa597f0c7043.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/marian_hagg%40sil.org%2f50a63a0a-6a95-4ea0-bd43-f6d1ba27457b%2fbloomdigital%2fASP_40-Tortoise_finds_his_house_Page_01_Image_2.png) |  | Tortoise Finds his House | bloom | 319200 | `8b6cc55e-93f3-4844-80ab-fa597f0c7043` |

## 그룹 152 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/2cd15b61-2bc1-42a6-94b5-5934eb13b7ea.jpg" width="110">](https://zuwbshdvpnranzheswdn.supabase.co/storage/v1/object/public/book-covers/bookdash-tumi-goes-to-the-park.webp) | **Y**<br>오디오 보유 | Tumi Goes to the Park | book_dash | 321489 | `2cd15b61-2bc1-42a6-94b5-5934eb13b7ea` |
| [<img src="covers/32d4b15b-facd-455b-9521-cf1c3d2117c5.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2023/04/35686-02a526e3718a8a48210b48220f03776d-coverImage.jpeg) |  | Tumi Goes to the Park | gdl | 198790 | `32d4b15b-facd-455b-9521-cf1c3d2117c5` |

## 그룹 153 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/56ba1664-c04f-4478-933a-e98c6d83d690.jpg" width="110">](https://africanstorybook.org/illustrations/covers/2454.png) |  | Vayu, the Wind | african_storybook | 38400 | `56ba1664-c04f-4478-933a-e98c6d83d690` |
| [<img src="covers/65e5ffd9-8e6f-46ab-8f3a-49174d51f192.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/okuukeremetbooks%40gmail.com%2f4ffbc553-75ba-4499-84c4-3de5c923a3a5%2fbloomdigital%2fVayu%2C%20the%20Wind_Page%2003.jpg) | **Y**<br>최대 해상도 | Vayu, the Wind | bloom | 256372 | `65e5ffd9-8e6f-46ab-8f3a-49174d51f192` |

## 그룹 154 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/30c86683-ab98-4634-b543-9fdf08ba95f6.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/MvN81OREsZ%2f1769689665149%2fbloomdigital%2fimage1.jpg) | **Y**<br>최대 해상도 | Watch Out! The Tiger is Here! | bloom | 495726 | `30c86683-ab98-4634-b543-9fdf08ba95f6` |
| [<img src="covers/f9a7cc69-398d-4bbf-b911-2500a0cbb7b9.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2022/03/httpsdigitallibrary.iowp-contentuploads20201021553-7c82e3c3967af7cd0fc0bc6c6c18d468-445b67d7f4a9cf54a05086d2112db303.jpg) |  | Watch Out! The Tiger is Here! | gdl | 443058 | `f9a7cc69-398d-4bbf-b911-2500a0cbb7b9` |

## 그룹 155 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/0cb8c332-8f0e-4eac-95ef-c6cc650ceb6c.jpg" width="110">](https://africanstorybook.org/illustrations/covers/10261.png) |  | Weather | african_storybook | 38400 | `0cb8c332-8f0e-4eac-95ef-c6cc650ceb6c` |
| [<img src="covers/cef54ff1-2c65-4128-a91f-686646f55116.jpg" width="110">](https://africanstorybook.org/illustrations/covers/40040.png) |  | Weather | african_storybook | 38400 | `cef54ff1-2c65-4128-a91f-686646f55116` |

> 유지 추천 없음 — **팀장 판단(해상도 동률 2권)**

## 그룹 156 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/19d11054-dcb2-4a8b-8f9c-f779f109f64c.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2022/03/httpsdigitallibrary.iowp-contentuploads20201015683-7c82e3c3967af7cd0fc0bc6c6c18d468-d49781e31071a190e0f19b52d2b12a39.jpg) | **Y**<br>최대 해상도 | What Does Anu See? | gdl | 440181 | `19d11054-dcb2-4a8b-8f9c-f779f109f64c` |
| [<img src="covers/dceba8aa-3865-47a3-9b47-96dd942a45c0.jpg" width="110">](https://s3.amazonaws.com/bloomharvest/librarian%40bloomlibrary.org%2f9fdf0e7f-9ed0-49a7-95a3-5514e4a6b5f7%2fbloomdigital%2fSWPB_144-what-does-anu-see_Page_02_Image_0001.png) |  | What Does Anu See? | bloom | 171600 | `dceba8aa-3865-47a3-9b47-96dd942a45c0` |

## 그룹 157 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/4fe74f3e-0f66-4465-b41d-6291b443669e.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2023/04/35403-d05e2c60b94c428e076fbad0f2cc2778-coverImage.png) |  | What's In the Pot? | gdl | 240975 | `4fe74f3e-0f66-4465-b41d-6291b443669e` |
| [<img src="covers/8836449c-5cca-4557-b277-c1897f86d63b.jpg" width="110">](https://zuwbshdvpnranzheswdn.supabase.co/storage/v1/object/public/book-covers/bookdash-whats-in-the-pot.webp) | **Y**<br>오디오 보유 | What’s In The Pot? | book_dash | 321489 | `8836449c-5cca-4557-b277-c1897f86d63b` |

## 그룹 158 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/0bd47d70-0d63-4c2b-a6af-14cbe3be272a.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2023/04/35462-02a526e3718a8a48210b48220f03776d-coverImage.jpeg) |  | What's Next | gdl | 5579044 | `0bd47d70-0d63-4c2b-a6af-14cbe3be272a` |
| [<img src="covers/3f9d5f51-da93-4570-ad12-7c223ccbbe6f.jpg" width="110">](https://zuwbshdvpnranzheswdn.supabase.co/storage/v1/object/public/book-covers/bookdash-whats-next.webp) | **Y**<br>오디오 보유 | What’s next? | book_dash | 360000 | `3f9d5f51-da93-4570-ad12-7c223ccbbe6f` |

## 그룹 159 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/f439efa5-df10-4ba1-803e-fa949afe3e1b.jpg" width="110">](https://content.digitallibrary.io/wp-content/uploads/2023/04/34917-d05e2c60b94c428e076fbad0f2cc2778-coverImage.png) |  | Who's That Baby? | gdl | 1585200 | `f439efa5-df10-4ba1-803e-fa949afe3e1b` |
| [<img src="covers/2124c60b-0b1a-4af1-8514-c7dae96460e1.jpg" width="110">](https://zuwbshdvpnranzheswdn.supabase.co/storage/v1/object/public/book-covers/bookdash-whos-that-baby.webp) | **Y**<br>오디오 보유 | Who’s that baby? | book_dash | 360000 | `2124c60b-0b1a-4af1-8514-c7dae96460e1` |

## 그룹 160 · 2권 · matched_by=`title`

| 표지 | 유지 | 제목 | 플랫폼 | 해상도 | id |
|---|---|---|---|---|---|
| [<img src="covers/90921e87-b693-406d-9fe1-81a3261cb633.jpg" width="110">](https://africanstorybook.org/illustrations/covers/9092.png) |  | Zanele Situ: my Story | african_storybook | 38400 | `90921e87-b693-406d-9fe1-81a3261cb633` |
| [<img src="covers/c2820fc8-380f-46a4-86c5-9cb18f1179a7.jpg" width="110">](https://bookdash.github.io/bookdash-books/zanele-situ-my-story/en/images/cover.jpg) | **Y**<br>오디오 보유 | Zanele Situ: My Story | book_dash | 610700 | `c2820fc8-380f-46a4-86c5-9cb18f1179a7` |
