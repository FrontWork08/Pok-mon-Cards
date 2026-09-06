# Pipeline de modelos 3D

A arena nativa usa `expo-gl` + `three`. Os arquivos de modelo nao precisam ficar dentro do APK: eles sao publicados no Supabase Storage e descritos em `public.pokemon_3d_models`.

## Regra principal

Adicionar ou trocar um modelo **nao exige um novo APK** enquanto o arquivo continuar dentro das capacidades ja instaladas no runtime atual (GLB/GLTF via Three.js/Expo GL). O campo `version` do registro deve ser incrementado sempre que o arquivo for substituido; isso muda a chave do cache local e faz o app baixar a nova versao automaticamente.

Um APK novo so e necessario se for preciso adicionar/trocar uma dependencia nativa, decoder nativo, engine de renderizacao ou outra capacidade que o binario instalado ainda nao possua.

## Formato recomendado

- Um arquivo `.glb` autocontido por Pokemon/forma.
- Ate 25 MB por arquivo; para celular, prefira bem menos que isso.
- Evite Draco/KTX2 e outras extensoes que exijam decoders que nao fazem parte do runtime atual.
- Prefira materiais PBR simples e texturas em formatos comuns. Se um GLB nao puder ser interpretado no aparelho, a arena mantem o modelo procedural e a batalha continua.
- O arquivo deve ser um asset proprio ou devidamente licenciado para uso no projeto. Nao coloque binarios 3D obtidos sem permissao.

## Estrutura no Storage

Bucket: `pokemon-3d`

Convencao sugerida:

```text
pokemon-3d/
  0001/default/v1/model.glb
  0001/default/v2/model.glb
  0006/default/v1/model.glb
```

A pasta nao e obrigatoria para o loader, mas manter `pokemon_id/form_key/version` torna rollback e auditoria mais simples.

## Registro

Depois de enviar o GLB ao bucket, crie ou atualize a linha de `public.pokemon_3d_models`.

Campos importantes:

- `pokemon_id`: numero da Pokedex usado pela batalha.
- `form_key`: hoje a arena consulta `default`.
- `storage_path`: caminho dentro do bucket, sem o nome do bucket.
- `version`: inteiro crescente usado para invalidar o cache.
- `byte_size`: tamanho exato em bytes, recomendado para detectar arquivo trocado sem atualizar metadados.
- `sha256`: hash opcional para identificacao/auditoria e para diferenciar o nome de cache.
- `scale`: ajuste fino depois do auto-fit da arena.
- `offset_x/y/z`: ajuste de posicao local.
- `rotation_y`: correcao de orientacao em radianos.
- `animations`: mapeamento opcional dos nomes reais dos clips.
- `enabled`: somente linhas habilitadas sao visiveis ao app.

Exemplo de mapeamento de animacoes:

```json
{
  "idle": "Idle",
  "attack": "Attack",
  "hit": "Hit",
  "faint": "Faint",
  "victory": "Victory"
}
```

Se o JSON estiver vazio, o app tenta reconhecer os clips pelos nomes mais comuns (`idle`, `attack`, `hit`, `hurt`, `faint`, `ko`, `victory`, etc.).

## Cache no aparelho

O arquivo e baixado apenas quando um Pokemon que possui modelo publicado entra em uma arena 3D. O cache usa Pokemon + forma + versao + hash no nome do arquivo.

Limites atuais do cache:

- qualidade baixa: 64 MB;
- media: 128 MB;
- alta: 224 MB.

Arquivos antigos sao removidos quando o limite e ultrapassado. Se nao houver modelo cadastrado, download falhar ou o GLB nao puder ser interpretado, o app usa o 3D procedural existente.

## Checklist para publicar um novo modelo

1. Confirmar que o asset pode ser usado legalmente no projeto.
2. Exportar um GLB otimizado para celular.
3. Conferir tamanho e animacoes.
4. Enviar para `pokemon-3d/<pokedex>/default/vN/model.glb`.
5. Inserir/atualizar o registro e incrementar `version`.
6. Testar em aparelho Android real em qualidade baixa e alta.
7. So marcar `enabled = true` depois de validar enquadramento, orientacao e animacoes.
