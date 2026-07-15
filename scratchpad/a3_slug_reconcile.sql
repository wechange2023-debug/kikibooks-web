-- a3_slug_reconcile.sql — slug 코호트 정합 확인 (Phase A-3b)
-- 목적: books의 book_dash slug-코호트(155) vs population_154(154) 차이 1권 규명 +
--       비활성 3권이 154 안에 있는지 확정.
-- 실행: 팀장(Supabase SQL Editor). 워커 초안. 전부 SELECT — DB·Storage 쓰기 없음.
-- 사용법: 각 질의(Q1~Q4)는 독립 실행 가능(with pop 블록 각각 반복). 하나씩 붙여 Run.
-- slug 출처: scripts/pdf_harvest/population_154.txt (154개, 스크립트 자동 생성).

-- ═══════════════════════════════════════════════════════════════════
-- Q1 목적: population에 있는데 books에 없는 slug / 기대값: 0행
-- ═══════════════════════════════════════════════════════════════════
with pop(slug) as (values
    ('a-day-out'), ('a-trip-to-the-tap'), ('a-very-busy-day'), ('aaaaahhh-mmawe'),
    ('alexs-super-medicine'), ('amahle-wants-to-help'), ('and-also'), ('ann-nem-oh-nee-finds-adventure'),
    ('auntie-bois-gift'), ('baby-babble'), ('baby-talk'), ('babys-first-family-photo'),
    ('banzis-busy-bees'), ('best-friends'), ('brave-bora'), ('catch-that-cat'),
    ('circles'), ('clever-pig'), ('come-stay-with-me'), ('dance-khuzwayo-dance'),
    ('dance-mihlali'), ('dudus-hat'), ('egg'), ('feathered-friends'),
    ('fifi-and-teddy'), ('foxy-joxy-plays-a-trick'), ('going-places'), ('grandpa-farouks-garden'),
    ('grumpy-cloud'), ('hello'), ('hello-baby'), ('how-do-you-eat'),
    ('how-do-you-sleep'), ('how-do-you-want-your-eggs'), ('how-to-tame-a-monster'), ('i-dont-want-to-go-to-sleep'),
    ('i-hate-winter'), ('i-want-to'), ('im-the-colour-of-honey'), ('its-my-birthday'),
    ('its-my-book'), ('joannas-grannies'), ('jock-and-me'), ('julia-loves-books'),
    ('just-like-me'), ('khaya-wants-to-row'), ('knight-times'), ('lebo-and-gogos-tea-party'),
    ('lesedis-sandbox'), ('lets-be-friends'), ('lets-go-on-a-litter-hunt'), ('lets-have-an-inside-day'),
    ('lets-party'), ('lions-are-always-brave'), ('little-goat'), ('little-shoots'),
    ('lonwabos-recipes'), ('look-out-luthando'), ('look-up'), ('malis-friend'),
    ('mama-antelopes-house'), ('mama-whats-for-lunch'), ('matthew-is-up'), ('mazi-learns-to-play'),
    ('meerkat-magic'), ('mina-and-the-birthday-dress'), ('miss-tiny-chef'), ('mogaus-gift'),
    ('moms-hands'), ('moms-red-coat'), ('monkey-business'), ('mud'),
    ('my-dream-in-the-drawer'), ('my-inside-weather'), ('my-special-blankie'), ('my-special-hair'),
    ('no'), ('nomvundla-and-the-chilli-eating-contest'), ('o-rain-come'), ('open-the-door'),
    ('oumas-amazing-flowers'), ('oyisa-and-the-giant-tree'), ('pako-the-pigeon-disappears'), ('palesa-can-walk'),
    ('samoosas'), ('sams-treasures'), ('scared-tumi'), ('senzo-and-the-sun'),
    ('shaka-and-mazi'), ('shhhhh'), ('sing-to-me'), ('small-birds-big-adventure'),
    ('tata-comes-home'), ('tejus-shadow'), ('thats-not-thabi-thats-a-hippopotamus'), ('the-baby-book'),
    ('the-best-gift'), ('the-best-nest'), ('the-biscuit-jar-must-fall'), ('the-bounce'),
    ('the-box'), ('the-boy-who-only-ate-pancakes'), ('the-cottonwool-doctor'), ('the-dream-pillow'),
    ('the-fish-and-chickens-wedding'), ('the-fish-that-couldnt-swim'), ('the-great-cake-contest'), ('the-great-tidy-up'),
    ('the-lazy-ant'), ('the-lost-laugh'), ('the-memory-tree'), ('the-monster-must-go'),
    ('the-new-road'), ('the-one-in-the-middle'), ('the-pumpkin-chase'), ('the-rainbow-cloud'),
    ('the-sausage-dog'), ('the-sea'), ('the-things-that-really-matter'), ('the-three-doof-doofs'),
    ('the-very-tired-lioness'), ('the-window-seat'), ('theres-a-fire-on-the-mountain'), ('theres-an-alien-in-my-house'),
    ('thuli-special-and-the-secret'), ('thulis-tissue'), ('tigs-world'), ('tikky-boom-tish'),
    ('tlotlegos-tea-party'), ('tones-big-drop'), ('tumi-goes-to-the-park'), ('unathi-and-the-dirty-smelly-beast'),
    ('whats-at-the-park'), ('whats-happened-to-our-water'), ('whats-in-the-pot'), ('whats-next'),
    ('where-is-lulu'), ('where-is-thabo'), ('who-takes-the-train'), ('who-took-my-shoe'),
    ('whos-that-baby'), ('whose-shoe-is-this'), ('why-birds-sing-at-dawn'), ('why-is-there-a-hole-in-the-wall'),
    ('why-the-owl-never-sleeps'), ('wiggle-jiggle'), ('woof-woof'), ('yapo-saves-the-day'),
    ('yes-you-can'), ('you-yes-you'), ('zandi-and-birdy-monster'), ('zanele-sees-numbers'),
    ('zenandes-helping-hands'), ('zibu-and-zizo')
)
select p.slug from pop p
where not exists (select 1 from books b
  where b.source_platform='book_dash' and b.source_id = p.slug);

-- ═══════════════════════════════════════════════════════════════════
-- Q2 목적: books의 slug 코호트인데 population에 없는 행 / 기대값: 정체불명 1행
-- ═══════════════════════════════════════════════════════════════════
with pop(slug) as (values
    ('a-day-out'), ('a-trip-to-the-tap'), ('a-very-busy-day'), ('aaaaahhh-mmawe'),
    ('alexs-super-medicine'), ('amahle-wants-to-help'), ('and-also'), ('ann-nem-oh-nee-finds-adventure'),
    ('auntie-bois-gift'), ('baby-babble'), ('baby-talk'), ('babys-first-family-photo'),
    ('banzis-busy-bees'), ('best-friends'), ('brave-bora'), ('catch-that-cat'),
    ('circles'), ('clever-pig'), ('come-stay-with-me'), ('dance-khuzwayo-dance'),
    ('dance-mihlali'), ('dudus-hat'), ('egg'), ('feathered-friends'),
    ('fifi-and-teddy'), ('foxy-joxy-plays-a-trick'), ('going-places'), ('grandpa-farouks-garden'),
    ('grumpy-cloud'), ('hello'), ('hello-baby'), ('how-do-you-eat'),
    ('how-do-you-sleep'), ('how-do-you-want-your-eggs'), ('how-to-tame-a-monster'), ('i-dont-want-to-go-to-sleep'),
    ('i-hate-winter'), ('i-want-to'), ('im-the-colour-of-honey'), ('its-my-birthday'),
    ('its-my-book'), ('joannas-grannies'), ('jock-and-me'), ('julia-loves-books'),
    ('just-like-me'), ('khaya-wants-to-row'), ('knight-times'), ('lebo-and-gogos-tea-party'),
    ('lesedis-sandbox'), ('lets-be-friends'), ('lets-go-on-a-litter-hunt'), ('lets-have-an-inside-day'),
    ('lets-party'), ('lions-are-always-brave'), ('little-goat'), ('little-shoots'),
    ('lonwabos-recipes'), ('look-out-luthando'), ('look-up'), ('malis-friend'),
    ('mama-antelopes-house'), ('mama-whats-for-lunch'), ('matthew-is-up'), ('mazi-learns-to-play'),
    ('meerkat-magic'), ('mina-and-the-birthday-dress'), ('miss-tiny-chef'), ('mogaus-gift'),
    ('moms-hands'), ('moms-red-coat'), ('monkey-business'), ('mud'),
    ('my-dream-in-the-drawer'), ('my-inside-weather'), ('my-special-blankie'), ('my-special-hair'),
    ('no'), ('nomvundla-and-the-chilli-eating-contest'), ('o-rain-come'), ('open-the-door'),
    ('oumas-amazing-flowers'), ('oyisa-and-the-giant-tree'), ('pako-the-pigeon-disappears'), ('palesa-can-walk'),
    ('samoosas'), ('sams-treasures'), ('scared-tumi'), ('senzo-and-the-sun'),
    ('shaka-and-mazi'), ('shhhhh'), ('sing-to-me'), ('small-birds-big-adventure'),
    ('tata-comes-home'), ('tejus-shadow'), ('thats-not-thabi-thats-a-hippopotamus'), ('the-baby-book'),
    ('the-best-gift'), ('the-best-nest'), ('the-biscuit-jar-must-fall'), ('the-bounce'),
    ('the-box'), ('the-boy-who-only-ate-pancakes'), ('the-cottonwool-doctor'), ('the-dream-pillow'),
    ('the-fish-and-chickens-wedding'), ('the-fish-that-couldnt-swim'), ('the-great-cake-contest'), ('the-great-tidy-up'),
    ('the-lazy-ant'), ('the-lost-laugh'), ('the-memory-tree'), ('the-monster-must-go'),
    ('the-new-road'), ('the-one-in-the-middle'), ('the-pumpkin-chase'), ('the-rainbow-cloud'),
    ('the-sausage-dog'), ('the-sea'), ('the-things-that-really-matter'), ('the-three-doof-doofs'),
    ('the-very-tired-lioness'), ('the-window-seat'), ('theres-a-fire-on-the-mountain'), ('theres-an-alien-in-my-house'),
    ('thuli-special-and-the-secret'), ('thulis-tissue'), ('tigs-world'), ('tikky-boom-tish'),
    ('tlotlegos-tea-party'), ('tones-big-drop'), ('tumi-goes-to-the-park'), ('unathi-and-the-dirty-smelly-beast'),
    ('whats-at-the-park'), ('whats-happened-to-our-water'), ('whats-in-the-pot'), ('whats-next'),
    ('where-is-lulu'), ('where-is-thabo'), ('who-takes-the-train'), ('who-took-my-shoe'),
    ('whos-that-baby'), ('whose-shoe-is-this'), ('why-birds-sing-at-dawn'), ('why-is-there-a-hole-in-the-wall'),
    ('why-the-owl-never-sleeps'), ('wiggle-jiggle'), ('woof-woof'), ('yapo-saves-the-day'),
    ('yes-you-can'), ('you-yes-you'), ('zandi-and-birdy-monster'), ('zanele-sees-numbers'),
    ('zenandes-helping-hands'), ('zibu-and-zizo')
)
select b.source_id, b.is_active, b.title, b.synced_at from books b
where b.source_platform='book_dash'
  and b.source_id !~ '^[0-9a-f]{8}-'
  and not exists (select 1 from pop p where p.slug = b.source_id)
order by b.source_id;

-- ═══════════════════════════════════════════════════════════════════
-- Q3 목적: population 154권 중 is_active=false 인 책 / 기대값: 0~3행
-- ═══════════════════════════════════════════════════════════════════
with pop(slug) as (values
    ('a-day-out'), ('a-trip-to-the-tap'), ('a-very-busy-day'), ('aaaaahhh-mmawe'),
    ('alexs-super-medicine'), ('amahle-wants-to-help'), ('and-also'), ('ann-nem-oh-nee-finds-adventure'),
    ('auntie-bois-gift'), ('baby-babble'), ('baby-talk'), ('babys-first-family-photo'),
    ('banzis-busy-bees'), ('best-friends'), ('brave-bora'), ('catch-that-cat'),
    ('circles'), ('clever-pig'), ('come-stay-with-me'), ('dance-khuzwayo-dance'),
    ('dance-mihlali'), ('dudus-hat'), ('egg'), ('feathered-friends'),
    ('fifi-and-teddy'), ('foxy-joxy-plays-a-trick'), ('going-places'), ('grandpa-farouks-garden'),
    ('grumpy-cloud'), ('hello'), ('hello-baby'), ('how-do-you-eat'),
    ('how-do-you-sleep'), ('how-do-you-want-your-eggs'), ('how-to-tame-a-monster'), ('i-dont-want-to-go-to-sleep'),
    ('i-hate-winter'), ('i-want-to'), ('im-the-colour-of-honey'), ('its-my-birthday'),
    ('its-my-book'), ('joannas-grannies'), ('jock-and-me'), ('julia-loves-books'),
    ('just-like-me'), ('khaya-wants-to-row'), ('knight-times'), ('lebo-and-gogos-tea-party'),
    ('lesedis-sandbox'), ('lets-be-friends'), ('lets-go-on-a-litter-hunt'), ('lets-have-an-inside-day'),
    ('lets-party'), ('lions-are-always-brave'), ('little-goat'), ('little-shoots'),
    ('lonwabos-recipes'), ('look-out-luthando'), ('look-up'), ('malis-friend'),
    ('mama-antelopes-house'), ('mama-whats-for-lunch'), ('matthew-is-up'), ('mazi-learns-to-play'),
    ('meerkat-magic'), ('mina-and-the-birthday-dress'), ('miss-tiny-chef'), ('mogaus-gift'),
    ('moms-hands'), ('moms-red-coat'), ('monkey-business'), ('mud'),
    ('my-dream-in-the-drawer'), ('my-inside-weather'), ('my-special-blankie'), ('my-special-hair'),
    ('no'), ('nomvundla-and-the-chilli-eating-contest'), ('o-rain-come'), ('open-the-door'),
    ('oumas-amazing-flowers'), ('oyisa-and-the-giant-tree'), ('pako-the-pigeon-disappears'), ('palesa-can-walk'),
    ('samoosas'), ('sams-treasures'), ('scared-tumi'), ('senzo-and-the-sun'),
    ('shaka-and-mazi'), ('shhhhh'), ('sing-to-me'), ('small-birds-big-adventure'),
    ('tata-comes-home'), ('tejus-shadow'), ('thats-not-thabi-thats-a-hippopotamus'), ('the-baby-book'),
    ('the-best-gift'), ('the-best-nest'), ('the-biscuit-jar-must-fall'), ('the-bounce'),
    ('the-box'), ('the-boy-who-only-ate-pancakes'), ('the-cottonwool-doctor'), ('the-dream-pillow'),
    ('the-fish-and-chickens-wedding'), ('the-fish-that-couldnt-swim'), ('the-great-cake-contest'), ('the-great-tidy-up'),
    ('the-lazy-ant'), ('the-lost-laugh'), ('the-memory-tree'), ('the-monster-must-go'),
    ('the-new-road'), ('the-one-in-the-middle'), ('the-pumpkin-chase'), ('the-rainbow-cloud'),
    ('the-sausage-dog'), ('the-sea'), ('the-things-that-really-matter'), ('the-three-doof-doofs'),
    ('the-very-tired-lioness'), ('the-window-seat'), ('theres-a-fire-on-the-mountain'), ('theres-an-alien-in-my-house'),
    ('thuli-special-and-the-secret'), ('thulis-tissue'), ('tigs-world'), ('tikky-boom-tish'),
    ('tlotlegos-tea-party'), ('tones-big-drop'), ('tumi-goes-to-the-park'), ('unathi-and-the-dirty-smelly-beast'),
    ('whats-at-the-park'), ('whats-happened-to-our-water'), ('whats-in-the-pot'), ('whats-next'),
    ('where-is-lulu'), ('where-is-thabo'), ('who-takes-the-train'), ('who-took-my-shoe'),
    ('whos-that-baby'), ('whose-shoe-is-this'), ('why-birds-sing-at-dawn'), ('why-is-there-a-hole-in-the-wall'),
    ('why-the-owl-never-sleeps'), ('wiggle-jiggle'), ('woof-woof'), ('yapo-saves-the-day'),
    ('yes-you-can'), ('you-yes-you'), ('zandi-and-birdy-monster'), ('zanele-sees-numbers'),
    ('zenandes-helping-hands'), ('zibu-and-zizo')
)
select b.source_id, b.is_active, b.title from books b
join pop p on p.slug = b.source_id
where b.source_platform='book_dash' and b.is_active = false
order by b.source_id;

-- ═══════════════════════════════════════════════════════════════════
-- Q4 목적: 매칭 요약 / 기대값: 154
-- ═══════════════════════════════════════════════════════════════════
with pop(slug) as (values
    ('a-day-out'), ('a-trip-to-the-tap'), ('a-very-busy-day'), ('aaaaahhh-mmawe'),
    ('alexs-super-medicine'), ('amahle-wants-to-help'), ('and-also'), ('ann-nem-oh-nee-finds-adventure'),
    ('auntie-bois-gift'), ('baby-babble'), ('baby-talk'), ('babys-first-family-photo'),
    ('banzis-busy-bees'), ('best-friends'), ('brave-bora'), ('catch-that-cat'),
    ('circles'), ('clever-pig'), ('come-stay-with-me'), ('dance-khuzwayo-dance'),
    ('dance-mihlali'), ('dudus-hat'), ('egg'), ('feathered-friends'),
    ('fifi-and-teddy'), ('foxy-joxy-plays-a-trick'), ('going-places'), ('grandpa-farouks-garden'),
    ('grumpy-cloud'), ('hello'), ('hello-baby'), ('how-do-you-eat'),
    ('how-do-you-sleep'), ('how-do-you-want-your-eggs'), ('how-to-tame-a-monster'), ('i-dont-want-to-go-to-sleep'),
    ('i-hate-winter'), ('i-want-to'), ('im-the-colour-of-honey'), ('its-my-birthday'),
    ('its-my-book'), ('joannas-grannies'), ('jock-and-me'), ('julia-loves-books'),
    ('just-like-me'), ('khaya-wants-to-row'), ('knight-times'), ('lebo-and-gogos-tea-party'),
    ('lesedis-sandbox'), ('lets-be-friends'), ('lets-go-on-a-litter-hunt'), ('lets-have-an-inside-day'),
    ('lets-party'), ('lions-are-always-brave'), ('little-goat'), ('little-shoots'),
    ('lonwabos-recipes'), ('look-out-luthando'), ('look-up'), ('malis-friend'),
    ('mama-antelopes-house'), ('mama-whats-for-lunch'), ('matthew-is-up'), ('mazi-learns-to-play'),
    ('meerkat-magic'), ('mina-and-the-birthday-dress'), ('miss-tiny-chef'), ('mogaus-gift'),
    ('moms-hands'), ('moms-red-coat'), ('monkey-business'), ('mud'),
    ('my-dream-in-the-drawer'), ('my-inside-weather'), ('my-special-blankie'), ('my-special-hair'),
    ('no'), ('nomvundla-and-the-chilli-eating-contest'), ('o-rain-come'), ('open-the-door'),
    ('oumas-amazing-flowers'), ('oyisa-and-the-giant-tree'), ('pako-the-pigeon-disappears'), ('palesa-can-walk'),
    ('samoosas'), ('sams-treasures'), ('scared-tumi'), ('senzo-and-the-sun'),
    ('shaka-and-mazi'), ('shhhhh'), ('sing-to-me'), ('small-birds-big-adventure'),
    ('tata-comes-home'), ('tejus-shadow'), ('thats-not-thabi-thats-a-hippopotamus'), ('the-baby-book'),
    ('the-best-gift'), ('the-best-nest'), ('the-biscuit-jar-must-fall'), ('the-bounce'),
    ('the-box'), ('the-boy-who-only-ate-pancakes'), ('the-cottonwool-doctor'), ('the-dream-pillow'),
    ('the-fish-and-chickens-wedding'), ('the-fish-that-couldnt-swim'), ('the-great-cake-contest'), ('the-great-tidy-up'),
    ('the-lazy-ant'), ('the-lost-laugh'), ('the-memory-tree'), ('the-monster-must-go'),
    ('the-new-road'), ('the-one-in-the-middle'), ('the-pumpkin-chase'), ('the-rainbow-cloud'),
    ('the-sausage-dog'), ('the-sea'), ('the-things-that-really-matter'), ('the-three-doof-doofs'),
    ('the-very-tired-lioness'), ('the-window-seat'), ('theres-a-fire-on-the-mountain'), ('theres-an-alien-in-my-house'),
    ('thuli-special-and-the-secret'), ('thulis-tissue'), ('tigs-world'), ('tikky-boom-tish'),
    ('tlotlegos-tea-party'), ('tones-big-drop'), ('tumi-goes-to-the-park'), ('unathi-and-the-dirty-smelly-beast'),
    ('whats-at-the-park'), ('whats-happened-to-our-water'), ('whats-in-the-pot'), ('whats-next'),
    ('where-is-lulu'), ('where-is-thabo'), ('who-takes-the-train'), ('who-took-my-shoe'),
    ('whos-that-baby'), ('whose-shoe-is-this'), ('why-birds-sing-at-dawn'), ('why-is-there-a-hole-in-the-wall'),
    ('why-the-owl-never-sleeps'), ('wiggle-jiggle'), ('woof-woof'), ('yapo-saves-the-day'),
    ('yes-you-can'), ('you-yes-you'), ('zandi-and-birdy-monster'), ('zanele-sees-numbers'),
    ('zenandes-helping-hands'), ('zibu-and-zizo')
)
select count(*) as matched from books b
join pop p on p.slug = b.source_id
where b.source_platform='book_dash';
