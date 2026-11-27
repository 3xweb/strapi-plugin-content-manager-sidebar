import test from 'node:test';
import assert from 'node:assert/strict';
import { createSidebarControls, move, reconcile, snapshot } from './sidebar.mjs';

const entry = (uid) => ({ type: 'link', uid });
const group = (id, children) => ({ type: 'folder', id, name: id, children });

test('moves a single type into a collection group and reorders siblings', () => {
  const original = [group('Sales', [entry('collection')]), entry('single')];
  const grouped = move(original, 'link:single', 'folder:Sales', true);
  assert.deepEqual(grouped, [group('Sales', [entry('collection'), entry('single')])]);
  assert.deepEqual(move(grouped, 'link:single', 'link:collection'),
    [group('Sales', [entry('single'), entry('collection')])]);
  assert.deepEqual(move(grouped, 'link:single', null), original);
});

test('inserts a dragged link after the target in the same group', () => {
  const original = [group('Editorial', [entry('first'), entry('second'), entry('third')])];
  assert.deepEqual(move(original, 'link:first', 'link:second', false, true),
    [group('Editorial', [entry('second'), entry('first'), entry('third')])]);
  assert.deepEqual(move(original, 'link:third', 'link:first', false, true),
    [group('Editorial', [entry('first'), entry('third'), entry('second')])]);
});

test('reorders folders and refuses to move a folder into itself or a descendant', () => {
  const original = [group('A', [group('B', [])]), group('C', [])];
  assert.equal(move(original, 'folder:A', 'folder:B', true), original);
  assert.equal(move(original, 'folder:A', 'folder:A'), original);
  assert.deepEqual(move(original, 'folder:C', 'folder:A'), [original[1], original[0]]);
});

test('reconciles only permitted native links and adds new visible content types', () => {
  const article = { uid: 'article', to: '/content-manager/collection-types/article' };
  const news = { uid: 'news', to: '/content-manager/single-types/news' };
  const structure = [group('Editorial', [entry('hidden'), entry('article'), entry('article')])];
  const tree = reconcile(structure, [article, news]);
  assert.deepEqual(snapshot(tree), [group('Editorial', [entry('article')]), entry('news')]);
  assert.equal(tree[0].children[0].link, article);
});

test('only offers removal for a group with no stored children', () => {
  const restricted = group('Restricted', [entry('hidden')]);
  const layout = [group('Editorial', [restricted, group('Empty', [])])];
  const React = {
    createElement: (type, props, ...children) => ({ type, props, children }),
    cloneElement: (element, props) => ({ ...element, props: { ...element.props, ...props } }),
    useState: (initial) => [initial === false ? true : initial, () => {}],
    useRef: (current) => ({ current }),
  };
  const useSidebarControls = createSidebarControls(React, { Box: 'div', IconButton: 'button', Flex: 'div', Dialog: {} });
  const save = test.mock.fn();
  const controls = useSidebarControls([], [], layout, save);
  const [hidden, empty] = controls.sections[0].tree[0].children;
  const removeButton = (node) => controls.wrap(node, { type: 'folder' }).children[0].children[0].children
    .find((child) => child?.props?.label === 'Remove group');

  assert.deepEqual(hidden.children, []);
  assert.equal(removeButton(hidden), undefined);
  removeButton(empty).props.onClick();
  assert.deepEqual(save.mock.calls[0].arguments, [[group('Editorial', [restricted])]]);
});

test('dragging the native content row onto a group moves the link into it', () => {
  const article = { uid: 'article', title: 'Articles' };
  const layout = [entry('article'), group('Editorial', [])];
  const React = {
    createElement: (type, props, ...children) => ({ type, props, children }),
    cloneElement: (element, props) => ({ ...element, props: { ...element.props, ...props } }),
    useState: (initial) => [initial === false ? true : initial, () => {}],
    useRef: (current) => ({ current }),
  };
  const controls = createSidebarControls(React, { Box: 'div', IconButton: 'button', Flex: 'div', Dialog: {} });
  const save = test.mock.fn();
  const organizer = controls([], [article], layout, save);
  const [source, groupNode] = organizer.sections[0].tree;
  const row = organizer.wrap(source, { type: 'a' }).children[0].children[0].children[0];
  const destination = organizer.wrap(groupNode, { type: 'folder' }).children[0].children[1].props;
  const target = { dataset: {
    sidebarDrop: destination['data-sidebar-drop'],
    sidebarInside: destination['data-sidebar-inside'],
  } };
  const event = {
    isPrimary: true, button: 0, buttons: 1, pointerType: 'mouse', pointerId: 1,
    clientX: 0, clientY: 0,
    currentTarget: {
      setPointerCapture() {},
      ownerDocument: { elementFromPoint: () => ({ closest: () => target }) },
    },
  };

  row.props.onPointerDown(event);
  row.props.onPointerUp(event);
  assert.equal(save.mock.callCount(), 0);

  row.props.onPointerDown(event);
  row.props.onPointerMove({ ...event, clientY: 30 });
  row.props.onPointerUp({ ...event, clientY: 30 });
  assert.deepEqual(save.mock.calls[0].arguments, [[group('Editorial', [entry('article')])]]);
});

test('the reset trigger leaves the layout intact until the dialog action is confirmed', () => {
  const React = {
    createElement: (type, props, ...children) => ({ type, props, children }),
    useState: (initial) => [initial === false ? true : initial, () => {}],
    useRef: (current) => ({ current }),
  };
  const Dialog = {
    Root: 'Dialog.Root', Trigger: 'Dialog.Trigger', Content: 'Dialog.Content',
    Header: 'Dialog.Header', Body: 'Dialog.Body', Description: 'Dialog.Description',
    Footer: 'Dialog.Footer', Cancel: 'Dialog.Cancel', Action: 'Dialog.Action',
  };
  const controls = createSidebarControls(React, {
    Box: 'div', Flex: 'div', TextInput: 'input', IconButton: 'button', Button: 'button', Dialog,
  });
  const save = test.mock.fn();
  const { toolbar } = controls([], [], [group('Editorial', [])], save);
  const find = (element, type) => element?.type === type
    ? element
    : element?.children?.map((child) => find(child, type)).find(Boolean);

  assert.equal(find(toolbar, Dialog.Trigger).children[0].props.onClick, undefined);
  assert.equal(find(toolbar, Dialog.Cancel).children[0].props.onClick, undefined);
  assert.equal(save.mock.callCount(), 0);
  find(toolbar, Dialog.Action).children[0].props.onClick();
  assert.deepEqual(save.mock.calls[0].arguments, [null]);
});
