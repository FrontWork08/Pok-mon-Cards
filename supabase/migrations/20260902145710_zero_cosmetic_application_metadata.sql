update public.economy_store_items
set metadata=
  jsonb_set(
    jsonb_set(
      jsonb_set(coalesce(metadata,'{}'::jsonb),'{applyCardCost}','0'::jsonb,true),
      '{applyDeckCost}','0'::jsonb,true
    ),
    '{applyCost}','0'::jsonb,true
  )
where metadata ?| array['applyCardCost','applyDeckCost','applyCost'];
