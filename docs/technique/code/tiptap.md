# tiptap

### src/lib/tiptap/BlockDragHandle.js

- **Rôle du fichier :**
  - Fournit une extension Tiptap ajoutant une poignée (⠿) de drag & drop flottante pour déplacer facilement des blocs top-level (titres, paragraphes, listes) dans l’éditeur.
  - Permet la sélection automatique et le déplacement natif ProseMirror du bloc survolé via le drag & drop HTML standard.
  - Ne nécessite aucune dépendance externe (hors Tiptap/ProseMirror).

- **Fonctions exportées :**
  - **BlockDragHandle** (const, Extension Tiptap)
    - Paramètres : aucun (Utilisation via ajout dans la liste des extensions Tiptap).
    - Retour : instance Tiptap Extension, injectant le plugin ProseMirror associé.
    - Effet de bord notable :
      - Ajoute dynamiquement un élément DOM `.ut-ed-drag-handle` dans le wrapper de l’éditeur.
      - Modifie la sélection au drag start, injecte des données dans le drag event.
      - Nettoyage DOM et listeners à la destruction de la vue.

- **Fonctions internes non exportées :**
  - **blockDragHandlePlugin**
    - Paramètres : aucun (utilisé via Extension.create).
    - Retour : Instance ProseMirror Plugin.
    - Effet : Gère l’apparition/positionnement/removal de la poignée, la sélection et le drag & drop bloc.

- **Points d’attention / edge cases :**
  - **Dépendances** : ProseMirror (`@tiptap/core`, `@tiptap/pm/state`). Aucune dépendance externe.
  - **Edge cases** :
    - La poignée n’apparaît que sur des blocs de profondeur > 0 (skip les racines/document vide).
    - Très dépendant de la structure DOM attendue (`.ut-ed-wrap` doit envelopper le DOM de l’éditeur pour un placement correct).
    - Fait l’hypothèse que le bloc a un nœud DOM d’élément (nodeType === 1).
    - Ne gère pas (encore) le déplacement de groupes de blocs (ex : section entière ; cf. B2 dans le commentaire).
    - Le drag & drop s’appuie sur l’implémentation native de ProseMirror : certains effets visuels ou comportements (dropcursor) dépendent des plugins installés côté éditeur.

- **Autres remarques :**
  - Nettoie tous les listeners DOM et la poignée à la destruction de la vue.
  - Respecte l’accessibilité de base (`aria-label`).

### src/lib/tiptap/VariableNode.js

- **Rôle du fichier**
  - Déclare un nœud TipTap personnalisé "variable", utilisé comme placeholder atomique et inline dans l’éditeur de template.
  - Le nœud encode une clé (key) référencée dans `VARIABLE_CATALOG`, et affiche dynamiquement un chip visuel non modifiable (icône + label).

- **Fonctions/objets exportés**
  - `VariableNode`
    - Type : Node Tiptap personnalisé.
    - Attributs définis :
      - `key` (string) : Clé de variable (doit exister dans `VARIABLE_CATALOG`). Encodée dans le HTML comme `data-key`.
    - Principales méthodes redéfinies :
      - `addAttributes()`
        - Retourne la config des attributs (`key`), parsing/rendering inclus.
      - `parseHTML()`
        - Paramètres : aucun.
        - Retour : sélectionne l’élément `span[data-variable]`.
      - `renderHTML({ node, HTMLAttributes })`
        - Paramètre : objet `{ node, HTMLAttributes }`.
        - Retour : tableau décrivant le nœud HTML (`span` custom + contenu), avec label, icône et classes CSS.
        - Effet notable : l’affichage dépend du catalogue et de la langue (`options.lang`).
      - `addCommands()`
        - Retourne une commande personnalisée :
          - `insertVariable(key)`
            - Paramètre : `key` (string).
            - Retour : fonction d’insertion via `editor.commands.insertContent`.
    - Attributs TipTap natifs : atomique, inline, sélectionnable, draggable (drag natif du chip).

- **Points d’attention**
  - **Edge cases**
    - Si la `key` fournie n’est pas présente dans `VARIABLE_CATALOG`, fallback arbitraire : icône par défaut (`🔖`), label = key brute.
    - Les données stockées dans le document sont strictement limitées à la clé ; toute info (label, desc, icône) est déterminée à l’affichage.
  - **Dépendances**
    - @tiptap/core (Node, mergeAttributes).
    - `../../config/templates.js` — doit exposer un `VARIABLE_CATALOG` complet (structure : key, labels, icône, etc).
  - **Limitations**
    - Nœud atomique : impossible de modifier le chip lettre par lettre, mais il peut être déplacé/supprimé en bloc.
    - Langue affichée dépend de l’option `lang` (defaut : `fr`).
