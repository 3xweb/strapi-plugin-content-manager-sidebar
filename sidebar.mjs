export function snapshot(nodes) {
  return nodes.map((node) => node.type === 'link'
    ? { type: 'link', uid: node.link.uid }
    : { type: 'folder', id: node.id, name: node.name, children: snapshot(node.children) });
}

export function reconcile(layout, links) {
  const remaining = new Map(links.map((link) => [link.uid, link]));
  function visit(nodes) {
    return nodes.flatMap((node) => {
      if (node.type === 'folder') return [{ ...node, children: visit(node.children) }];
      const link = remaining.get(node.uid);
      if (!link) return [];
      remaining.delete(node.uid);
      return [{ type: 'link', link }];
    });
  }
  const tree = visit(layout);
  return [...tree, ...Array.from(remaining.values(), (link) => ({ type: 'link', link }))];
}

const key = (node) => node.type === 'folder' ? 'folder:' + node.id : 'link:' + node.uid;

function isEmptyGroup(nodes, id) {
  return nodes.some((node) => node.type === 'folder' && (
    node.id === id ? node.children.length === 0 : isEmptyGroup(node.children, id)
  ));
}

export function move(tree, source, target, inside = false, after = false) {
  if (source === target) return tree;
  const clone = (nodes) => nodes.map((node) => node.type === 'folder'
    ? { ...node, children: clone(node.children) }
    : node);
  const next = clone(tree);
  function find(nodes, id) {
    const index = nodes.findIndex((node) => key(node) === id);
    if (index >= 0) return { nodes, index, node: nodes[index] };
    for (const node of nodes) {
      const found = node.type === 'folder' && find(node.children, id);
      if (found) return found;
    }
    return null;
  }
  const from = find(next, source);
  const to = target === null ? null : find(next, target);
  if (!from || (target !== null && !to) ||
      (inside && to && to.node.type !== 'folder') ||
      (from.node.type === 'folder' && target !== null && find(from.node.children, target))) return tree;
  const destination = to ? (inside ? to.node.children : to.nodes) : next;
  const index = to && !inside ? to.index + Number(after) : destination.length;
  from.nodes.splice(from.index, 1);
  destination.splice(index - Number(from.nodes === destination && from.index < index), 0, from.node);
  return next;
}

export function createSidebarControls(React, { Box, Flex, Typography, TextInput, IconButton, Button, Dialog, Cog, Check, Plus, ArrowClockwise, Drag, Trash, ArrowUp, ArrowRight }) {
  const h = React.createElement;
  return function useSidebarControls(nativeSections, links, stored, save) {
    const [editing, setEditing] = React.useState(false);
    const moveFocus = React.useRef(false);
    const doneButton = React.useRef(null);
    const [picked, setPicked] = React.useState(null);
    const [name, setName] = React.useState('');
    const [collapsed, setCollapsed] = React.useState([]);
    const drag = React.useRef(null);
    const pointer = React.useRef(null);
    const suppressClick = React.useRef(false);
    const [hovered, setHovered] = React.useState(null);
    const native = () => nativeSections.map((section) => ({
      type: 'folder',
      id: 'native-' + section.id,
      name: section.title,
      children: snapshot(section.tree),
    }));
    const customized = Array.isArray(stored);
    const layout = customized ? stored : native();
    const tree = reconcile(layout, links);
    const editLayout = () => {
      const included = new Set();
      const collect = (nodes) => nodes.forEach((node) => node.type === 'folder'
        ? collect(node.children)
        : included.add(node.uid));
      collect(layout);
      return [...layout, ...links.filter((link) => !included.has(link.uid)).map((link) => ({
        type: 'link', uid: link.uid,
      }))];
    };
    const apply = (target, inside, after = false) => {
      const source = drag.current ?? picked;
      if (source) {
        const currentLayout = editLayout();
        const updatedLayout = move(currentLayout, source, target, inside, after);
        if (updatedLayout !== currentLayout) save(updatedLayout);
        if (!drag.current) doneButton.current?.focus();
        drag.current = null;
        setPicked(null);
      }
    };
    const destinationAt = (element, clientY) => {
      if (!element) return null;
      const target = element.dataset.sidebarDrop || null;
      const inside = element.dataset.sidebarInside === 'true';
      let after = false;
      if (target?.startsWith('link:')) {
        const row = element.closest('[data-sidebar-row]');
        const { top, height } = row.getBoundingClientRect();
        after = clientY >= top + height / 2;
      }
      return { target, inside, after };
    };
    const showDrop = (destination) => {
      if (!destination || destination.target === drag.current) {
        setHovered(null);
        return;
      }
      const { target, inside, after } = destination;
      setHovered(target?.startsWith('link:') ? target + (after ? ':after' : ':before') : inside ? target : null);
    };
    const dropTarget = (target, inside) => ({
      'data-sidebar-drop': target ?? '',
      'data-sidebar-inside': String(inside),
      onDragOver(event) {
        if (!drag.current) return;
        event.stopPropagation();
        const destination = destinationAt(event.currentTarget, event.clientY);
        const currentLayout = editLayout();
        if (move(currentLayout, drag.current, target, inside, destination.after) === currentLayout) {
          setHovered(null);
          return;
        }
        event.preventDefault();
        showDrop(destination);
      },
      onDragLeave(event) {
        if (!event.relatedTarget || !event.currentTarget.contains(event.relatedTarget)) setHovered(null);
      },
      onDrop(event) {
        if (!drag.current) return;
        event.preventDefault();
        event.stopPropagation();
        const { after } = destinationAt(event.currentTarget, event.clientY);
        apply(target, inside, after);
        setHovered(null);
      },
    });
    const pointerTarget = (event) => {
      const element = event.currentTarget.ownerDocument
        .elementFromPoint(event.clientX, event.clientY)?.closest('[data-sidebar-drop]');
      return destinationAt(element, event.clientY);
    };
    const iconButton = (label, Icon, props = {}) => h(IconButton, {
      type: 'button', label, withTooltip: true, size: 'XS', variant: 'ghost', ...props, children: h(Icon),
    });
    const toggleEditing = () => {
      moveFocus.current = true;
      setEditing(!editing);
      setPicked(null);
    };
    const focusToggle = (element) => {
      if (element && moveFocus.current) {
        moveFocus.current = false;
        element.focus();
      }
    };
    const toolbar = editing && h(Box, { key: 'sidebar-organizer', padding: 2 },
      h(Flex, { tag: 'form', gap: 1, onSubmit: (event) => {
        event.preventDefault();
        if (!name.trim()) return;
        save([...editLayout(), { type: 'folder', id: Date.now().toString(36),
          name: name.trim(), children: [] }]);
        setName('');
      } },
      h(Box, { flex: 1, minWidth: 0 }, h(TextInput, {
        'aria-label': 'Group name', placeholder: 'Group name', size: 'S', value: name,
        maxLength: 80, onChange: (event) => setName(event.target.value),
      })),
      iconButton('Add group', Plus, { type: 'submit', disabled: !name.trim() }),
      h(Dialog.Root, null,
        h(Dialog.Trigger, null, iconButton('Use default order', ArrowClockwise, { disabled: !customized })),
        h(Dialog.Content, { onCloseAutoFocus: (event) => {
          if (customized) return;
          event.preventDefault();
          doneButton.current?.focus();
        } },
          h(Dialog.Header, null, 'Restore default order?'),
          h(Dialog.Body, null,
            h(Dialog.Description, null, 'This removes your custom sidebar groups and order. Your content stays intact.')),
          h(Dialog.Footer, null,
            h(Dialog.Cancel, null, h(Button, { type: 'button', variant: 'tertiary' }, 'Cancel')),
            h(Dialog.Action, null, h(Button, {
              type: 'button', variant: 'danger',
              onClick: () => { save(null); setPicked(null); },
            }, 'Restore default order'))))),
      iconButton('Done organizing', Check, { ref: (element) => {
        doneButton.current = element;
        focusToggle(element);
      }, onClick: toggleEditing }))
    );
    return {
      toolbar,
      heading(title) {
        return h(Flex, { tag: 'span', gap: 1 }, title,
          !editing && iconButton('Organize sidebar', Cog, {
            'aria-expanded': false, ref: focusToggle, onClick: toggleEditing,
          }));
      },
      sections: customized || editing
        ? [{ id: 'organized', title: 'Content types', tree }]
        : nativeSections,
      collapsed,
      toggle(token, open) {
        setCollapsed((tokens) => open ? tokens.filter((value) => value !== token) : [...tokens, token]);
      },
      wrap(node, content) {
        if (!editing) return content;
        const folder = node.type === 'folder';
        const id = folder ? 'folder:' + node.id : 'link:' + node.link.uid;
        const label = folder ? node.name : node.link.title;
        const dragSource = {
          draggable: true,
          onDragStart(event) {
            event.stopPropagation();
            drag.current = id;
            event.dataTransfer.setData('text/plain', id);
            event.dataTransfer.effectAllowed = 'move';
          },
          onDragEnd() { drag.current = null; setHovered(null); },
        };
        const activeDrop = hovered === id && drag.current !== id;
        const dropLabel = folder && h(Typography, {
          variant: 'pi', textColor: activeDrop ? 'primary700' : 'neutral700',
          style: { whiteSpace: 'nowrap' },
        }, 'Drop here');
        const row = folder ? React.cloneElement(content, { endAction: dropLabel }) : React.cloneElement(content, {
          draggable: false,
          style: { cursor: 'grab', userSelect: 'none' },
          onPointerDown(event) {
            suppressClick.current = false;
            if (!event.isPrimary || event.button !== 0 || event.pointerType === 'touch') return;
            pointer.current = { x: event.clientX, y: event.clientY, active: false };
            event.currentTarget.setPointerCapture(event.pointerId);
          },
          onPointerMove(event) {
            const gesture = pointer.current;
            if (!gesture || !(event.buttons & 1)) return;
            if (!gesture.active) {
              if (Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) < 5) return;
              gesture.active = true;
              drag.current = id;
            }
            showDrop(pointerTarget(event));
          },
          onPointerUp(event) {
            const gesture = pointer.current;
            pointer.current = null;
            if (!gesture?.active) return;
            suppressClick.current = true;
            const destination = pointerTarget(event);
            if (destination) apply(destination.target, destination.inside, destination.after);
            drag.current = null;
            setHovered(null);
          },
          onPointerCancel() {
            pointer.current = null;
            drag.current = null;
            setHovered(null);
          },
          onClickCapture(event) {
            if (!suppressClick.current || event.detail === 0) return;
            suppressClick.current = false;
            event.preventDefault();
            event.stopPropagation();
          },
        });
        const actions = h(Flex, { gap: 1, ...dropTarget(id, false) },
          iconButton('Pick up ' + label, Drag, {
            ...dragSource, 'aria-pressed': picked === id,
            onClick: () => setPicked(picked === id ? null : id),
          }),
          picked && picked !== id && iconButton('Before', ArrowUp, { onClick: () => apply(id, false) }),
          picked && picked !== id && folder && iconButton('Inside', ArrowRight, { onClick: () => apply(id, true) }),
          folder && isEmptyGroup(layout, node.id) && iconButton('Remove group', Trash, { onClick: () => {
              const editableLayout = editLayout();
              if (!isEmptyGroup(editableLayout, node.id)) return;
              function remove(nodes) {
                return nodes.filter((entry) => key(entry) !== id).map((entry) => entry.type === 'folder'
                  ? { ...entry, children: remove(entry.children) } : entry);
              }
              doneButton.current?.focus();
              save(remove(editableLayout));
              setPicked(null);
          } })
        );
        const insertAfter = hovered === id + ':after';
        const insertBefore = hovered === id + ':before';
        return h(Box, {
          key: id, ...(!folder && dropTarget(id, false)),
          'data-sidebar-row': folder ? undefined : '',
          position: 'relative',
        },
          folder
            ? h(React.Fragment, null, actions, h(Box, {
              ...dropTarget(id, true),
              borderWidth: '1px', borderStyle: 'dashed', hasRadius: true,
              borderColor: activeDrop ? 'primary600' : 'neutral500',
              background: activeDrop ? 'primary100' : 'neutral0',
            }, row))
            : h(Flex, { justifyContent: 'space-between' }, h(Box, { flex: 1, minWidth: 0 }, row), actions),
          !folder && (insertBefore || insertAfter) && h(Box, {
            'aria-hidden': true,
            pointerEvents: 'none', position: 'absolute', left: 0, right: 0,
            top: insertBefore ? 0 : undefined, bottom: insertAfter ? 0 : undefined,
            height: '2px', background: 'primary600', hasRadius: true, zIndex: 1,
          })
        );
      },
    };
  };
}
