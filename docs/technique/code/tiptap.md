# tiptap

### src/lib/tiptap/BlockDragHandle.js

- **Rôle :** extension Tiptap sans dépendance externe qui affiche une poignée dans la gouttière gauche pour déplacer un bloc top-level par glisser-déposer. Le déplacement utilise le mécanisme natif de ProseMirror.
- **`BlockDragHandle`** — extension exportée ; option `label` (défaut : `'Déplacer le bloc'`) pour l’`aria-label`. Retourne un plugin ProseMirror. À son initialisation, le plugin ajoute la poignée au wrapper de l’éditeur et installe des écouteurs DOM ; ceux-ci sont retirés à la destruction de la vue.
- **`blockDragHandlePlugin(label)`** — fonction interne, non exportée ; `label` est une chaîne. Retourne un `Plugin`. Au survol, positionne la poignée sur le bloc détecté ; au démarrage du drag, crée une `NodeSelection` et définit `editorView.dragging` avec `move: true`. Le drag-end réinitialise cet état et masque la poignée.
- **Points d’attention :**
  - Déplace un seul bloc top-level, pas une section composée d’un titre et de son contenu.
  - La détection dépend de `posAtCoords`, de `nodeDOM` et de la structure du document ; les positions invalides ou les blocs sans nœud DOM sont ignorés.
  - Le wrapper est `.ut-ed-wrap`, sinon le parent de l’éditeur. Si aucun wrapper n’est trouvé, le calcul de position dépend de `wrapper` et peut échouer.
  - Dépend de `@tiptap/core` et des API ProseMirror `@tiptap/pm/state` (`Plugin`, `PluginKey`, `NodeSelection`). Le curseur de dépôt est fourni séparément, notamment par StarterKit.

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
