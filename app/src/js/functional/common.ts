import {
  ItemType,
  LabelType, RectType,
  ShapeType,
  State, VertexType,
  ViewerConfigType
} from './types';
import {removeObjectFields, updateListItem, updateListItems,
  updateObject,
} from './util';
import * as _ from 'lodash';
import {getColorById, idx} from './draw';

/**
 * Initialize state
 * @param {State} state
 * @return {State}
 */
export function initSession(state: State): State {
  // initialize state
  const items = state.items.slice();
  for (let i = 0; i < items.length; i++) {
    items[i] = updateObject(items[i], {loaded: false});
  }
  state = updateObject(state, {items});
  if (state.current.item === -1) {
    const current = updateObject(state.current, {item: 0});
    const items = updateListItem(
        state.items, 0, updateObject(state.items[0], {active: true}));
    return updateObject(state, {current, items});
  } else {
    return state;
  }
}

/**
 * Add new label. The ids of label and shapes will be updated according to
 * the current state.
 * @param {State} state: current state
 * @param {LabelType} label: new label to add.
 * @param {ShapeType} shapes: shapes of the label.
 * @return {State}
 */
export function addLabel(
    state: State,
    label: LabelType,
    shapes: ShapeType[] = []): State {
  const itemIndex = state.current.item;
  const newId = state.current.maxObjectId + 1;
  const shapeIds = _.range(shapes.length).map((i) => i + newId);
  const newShapes = shapes.map(
      (s, i) => updateObject(s, {label: newId, id: shapeIds[i]}));
  const labelId = newId + shapes.length;
  const color = getColorById(labelId);
  label = updateObject(label, {id: labelId, item: itemIndex,
    shapes: label.shapes.concat(shapeIds), color});
  let item = state.items[itemIndex];
  const labels = updateObject(
      item.labels,
      {[labelId]: label});
  const allShapes = updateObject(item.shapes, _.zipObject(shapeIds, newShapes));
  item = updateObject(item, {labels, shapes: allShapes});
  const items = updateListItem(state.items, itemIndex, item);
  const current = updateObject(
      state.current,
      {maxObjectId: labelId, label: labelId});
  return {
    ...state,
    items,
    current
  };
}

/**
 * Update the properties of a shape
 * @param {State} state
 * @param {number} shapeId
 * @param {object} props
 * @return {State}
 */
export function changeLabelShape(
    state: State, shapeId: number, props: object): State {
  const itemIndex = state.current.item;
  let item = state.items[itemIndex];
  const shape = updateObject(item.shapes[shapeId], props);
  item = updateObject(
      item, {shapes: updateObject(item.shapes, {[shapeId]: shape})});
  const items = updateListItem(state.items, itemIndex, item);
  return {...state, items};
}

/**
 * Update the rectangle and midpoints of a bounding box
 * @param {State} state
 * @param {number} labelId
 * @return {State}
 */
export function updateMidpoint(
  state: State, labelId: number): State {
  const itemIndex = state.current.item;
  let item = state.items[itemIndex];
  const label = item.labels[labelId];
  const newPositions: {[key: number]: ShapeType} = {};
  // midpoints
  for (let i = 2; i <= 8; i += 2) {
    const prevVertex = item.shapes[label.shapes[idx(i - 1, 8)]] as VertexType;
    const nextVertex = item.shapes[label.shapes[idx(i + 1, 8)]] as VertexType;
    const id = label.shapes[i];
    newPositions[id] = updateObject(item.shapes[id] as VertexType, {
      x: (prevVertex.x + nextVertex.x) / 2,
      y: (prevVertex.y + nextVertex.y) / 2
    });
  }
  // rectangle
  const tl = item.shapes[label.shapes[1]] as VertexType;
  const br = item.shapes[label.shapes[5]] as VertexType;
  newPositions[label.shapes[0]] = updateObject(
    item.shapes[label.shapes[0]] as RectType, {
    x: tl.x, y: tl.y, w: br.x - tl.x, h: br.y - tl.y
  });
  console.log('UPDATE MIDPOINT:', br.x - tl.x, br.y - tl.y)
  item = updateObject(
    item, {shapes: updateObject(item.shapes, newPositions)});
  const items = updateListItem(state.items, itemIndex, item);
  return {...state, items};
}

/**
 * Update label properties except shapes
 * @param {State} state
 * @param {number} labelId
 * @param {object} props
 * @return {State}
 */
export function changeLabelProps(
    state: State, labelId: number, props: object): State {
  const itemIndex = state.current.item;
  let item = state.items[itemIndex];
  const label = updateObject(item.labels[labelId], props);
  item = updateObject(
      item, {labels: updateObject(item.labels, {[labelId]: label})});
  const items = updateListItem(state.items, itemIndex, item);
  return {...state, items};
}

/**
 * Create Item from url with provided creator
 * @param {State} state
 * @param {Function} createItem
 * @param {string} url
 * @return {State}
 */
export function newItem(
    state: State, createItem: (itemId: number, url: string) => ItemType,
    url: string): State {
  const id = state.items.length;
  const item = createItem(id, url);
  const items = state.items.slice();
  items.push(item);
  return {
    ...state,
    items
  };
}

/**
 * Go to item at index
 * @param {State} state
 * @param {number} index
 * @return {State}
 */
export function goToItem(state: State, index: number): State {
  if (index < 0 || index >= state.items.length) {
    return state;
  }
  // TODO: don't do circling when no image number is shown
  // index = (index + state.items.length) % state.items.length;
  if (index === state.current.item) {
    return state;
  }
  const deactivatedItem = updateObject(state.items[state.current.item],
      {active: false});
  const activatedItem = updateObject(state.items[index], {active: true});
  const items = updateListItems(state.items,
      [state.current.item, index],
      [deactivatedItem, activatedItem]);
  const current = {...state.current, item: index};
  return updateObject(state, {items, current});
}

/**
 * Signify a new item is loaded
 * @param {State} state
 * @param {number} itemIndex
 * @param {ViewerConfigType} viewerConfig
 * @return {State}
 */
export function loadItem(state: State, itemIndex: number,
                         viewerConfig: ViewerConfigType): State {
  return updateObject(
      state, {items: updateListItem(
          state.items, itemIndex,
            updateObject(state.items[itemIndex],
                {viewerConfig, loaded: true}))});
}

// TODO: now we are using redux, we have all the history anyway,
// TODO: do we still need to keep around all labels in current state?
/**
 * Deconstruct given label
 * @param {State} state
 * @param {number} labelId
 * @return {State}
 */
export function deleteLabel(state: State, labelId: number): State {
  const itemIndex = state.current.item;
  const item = state.items[itemIndex];
  const label = item.labels[labelId];
  const labels = removeObjectFields(item.labels, [labelId]);
  // TODO: should we remove shapes?
  // depending on how boundary sharing is implemented.
  // remove labels
  const shapes = removeObjectFields(item.shapes, label.shapes);
  const items = updateListItem(state.items, itemIndex,
      updateObject(item, {labels, shapes}));
  // Reset selected object
  let current = state.current;
  if (current.label === labelId) {
    current = updateObject(current, {label: -1});
  }
  return updateObject(
      state, {current, items});
}

/**
 * Select a label
 * @param {State} state
 * @param {number} labelId
 * @return {State}
 */
export function selectLabel(state: State, labelId: number): State {
  let current = state.current;
  current = updateObject(current, {label: labelId});
  return updateObject(
    state, {current});
}

/**
 * Select a shape
 * @param {State} state
 * @param {number} shapeId
 * @return {State}
 */
export function selectShape(state: State, shapeId: number): State {
  let current = state.current;
  current = updateObject(current, {shape: shapeId});
  return updateObject(
    state, {current});
}

/**
 * assign Attribute to a label
 * @param {State} state
 * @param {number} _labelId
 * @param {object} _attributeOptions
 * @return {State}
 */
export function changeAttribute(state: State, _labelId: number,
                                _attributeOptions: any): State {
  return state;
}

/**
 * Notify all the subscribers to update. it is an no-op now.
 * @param {State} state
 * @return {State}
 */
export function updateAll(state: State): State {
  return state;
}

/**
 * turn on/off assistant view
 * @param {State} state
 * @return {State}
 */
export function toggleAssistantView(state: State): State {
  return updateObject(state, {layout:
            updateObject(state.layout, {assistantView:
                  !state.layout.assistantView})});
}
