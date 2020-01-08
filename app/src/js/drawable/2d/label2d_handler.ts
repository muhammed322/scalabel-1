import _ from 'lodash'
import { addLabel, changeLabelProps, changeShapes, linkLabels, unlinkLabels } from '../../action/common'
import { selectLabels, unselectLabels } from '../../action/select'
import Session from '../../common/session'
import { makeTrackPolicy, Track } from '../../common/track'
import { Key } from '../../common/types'
import { getLinkedLabelIds } from '../../functional/common'
import { makeTrack } from '../../functional/states'
import { State } from '../../functional/types'
import { Size2D } from '../../math/size2d'
import { Vector2D } from '../../math/vector2d'
import { Label2D } from './label2d'
import { makeDrawableLabel2D } from './label2d_list'

/**
 * List of drawable labels
 * ViewController for the labels
 */
export class Label2DHandler {
  /** Recorded state of last update */
  private _state: State
  /** highlighted label */
  private _highlightedLabel: Label2D | null
  /** The hashed list of keys currently down */
  private _keyDownMap: { [key: string]: boolean }
  /** index of currently selected item */
  private _selectedItemIndex: number
  /** whether mouse is down */
  private _mouseDown: boolean
  /** mouseDown Coordinate */
  private _mouseDownCoord: Vector2D

  constructor () {
    this._highlightedLabel = null
    this._state = Session.getState()
    this._keyDownMap = {}
    this._selectedItemIndex = -1
    this._mouseDown = false
    this._mouseDownCoord = new Vector2D()
  }

  /** get highlightedLabel for state inspection */
  public get highlightedLabel (): Label2D | null {
    return this._highlightedLabel
  }

  /**
   * Process mouse down action
   * @param coord
   * @param labelIndex
   * @param handleIndex
   */
  public onMouseDown (
      coord: Vector2D, _labelIndex: number, _handleIndex: number): boolean {
    this._mouseDownCoord = coord
    this._mouseDown = true
    console.log('onMouseDown Function')
    console.log(this._highlightedLabel)
    return true
  }

  /**
   * Process mouse up action
   * @param coord
   * @param labelIndex
   * @param handleIndex
   */
  public onMouseUp (
      coord: Vector2D, labelIndex: number, handleIndex: number): void {
    const line = coord.clone().subtract(this._mouseDownCoord)
    console.log('onMosueUp function')
    console.log(coord)
    if (line.area() < 10) {
      this.onMouseClick(coord, labelIndex, handleIndex)
    }
    console.log(line.area())
    if (this.hasSelectedLabels() && !this.isKeyDown(Key.META)) {
      Session.label2dList.selectedLabels.forEach((selectedLabel, index) => {
        if (selectedLabel !== this._highlightedLabel) {
          selectedLabel.setHighlighted(false)
        }
        if (line.area() >= 10) {
          selectedLabel.onMouseDragEnd(coord, labelIndex, handleIndex)
        }
        this.commitLabel(index)
      })
    }
    this._mouseDown = false
    this._mouseDownCoord = new Vector2D()
  }

  /**
   * Process mouse move action
   */
  public onMouseMove (
      coord: Vector2D, canvasLimit: Size2D,
      labelIndex: number, handleIndex: number): boolean {

    Session.label2dList.selectedLabels.forEach((selectedLabel) => {
      selectedLabel.onMouseMove(coord, canvasLimit, labelIndex, handleIndex)
    })
    if (this._mouseDown) {
      this.onMouseDrag(coord, canvasLimit, labelIndex, handleIndex)
      return true
    } else {
      if (labelIndex >= 0) {
        if (!this._highlightedLabel) {
          this._highlightedLabel = Session.label2dList.labelList[labelIndex]
        }
        if (this._highlightedLabel.index !== labelIndex) {
          this._highlightedLabel.setHighlighted(false)
          this._highlightedLabel = Session.label2dList.labelList[labelIndex]
        }
        this._highlightedLabel.setHighlighted(true, handleIndex)
      } else if (this._highlightedLabel !== null) {
        this._highlightedLabel.setHighlighted(false)
        this._highlightedLabel = null
      }
    }
    return false
  }

  /**
   * commit selectedLabel
   * @param index
   */
  public commitLabel (index: number): void {
    const selectedLabel = Session.label2dList.selectedLabels[index]
    const valid = selectedLabel.isValid()
    const editing = selectedLabel.editing
    if (valid || editing) {
      const [shapeIds, shapeTypes, shapeObjects] =
        selectedLabel.shapeObjects()
      if (valid) {
        if (selectedLabel.labelId < 0) {
        // Add new label to state
          if (Session.tracking) {
            const newTrack = new Track()
            newTrack.updateState(
              makeTrack(-1),
              makeTrackPolicy(newTrack, Session.label2dList.policyType)
            )
            newTrack.onLabelCreated(
              this._selectedItemIndex, selectedLabel, [-1]
            )
          } else {
            const label = selectedLabel.label
            Session.dispatch(addLabel(
              this._selectedItemIndex, label, shapeTypes, shapeObjects
            ))
          }
        } else {
        // Update existing label
          const label = selectedLabel.label
          Session.dispatch(changeShapes(
            this._selectedItemIndex, shapeIds, shapeObjects
          ))
          Session.dispatch(changeLabelProps(
            this._selectedItemIndex, selectedLabel.labelId, { manual: true }
          ))
          if (Session.tracking && label.track in Session.tracks) {
            Session.tracks[label.track].onLabelUpdated(
              this._selectedItemIndex,
              shapeObjects
            )
          }
        }
      }
    } else {
      Session.label2dList.labelList.splice(
        Session.label2dList.labelList.length - 1,
        1
      )
    }
  }

  /**
   * Handle keyboard down events
   * @param e
   */
  public onKeyDown (e: KeyboardEvent): void {
    this._keyDownMap[e.key] = true
    for (const selectedLabel of Session.label2dList.selectedLabels) {
      if (!selectedLabel.onKeyDown(e.key)) {
        Session.label2dList.labelList.splice(
          Session.label2dList.labelList.indexOf(
            Session.label2dList.selectedLabels[0]
          ),
          1
        )
        Session.label2dList.selectedLabels.length = 0
      }
    }
    switch (e.key) {
      case Key.L_LOW:
        // linking
        this.linkLabels()
        break
      case Key.L_UP:
        // unlinking
        this.unlinkLabels()
        break
    }
  }

  /** Update state */
  public updateState (state: State) {
    this._state = state
    this._selectedItemIndex = state.user.select.item
  }

  /**
   * Handle keyboard up events
   * @param e
   */
  public onKeyUp (e: KeyboardEvent): void {
    delete this._keyDownMap[e.key]
    for (const selectedLabel of Session.label2dList.selectedLabels) {
      selectedLabel.onKeyUp(e.key)
    }
  }

  /** returns whether selectedLabels is empty */
  private hasSelectedLabels (): boolean {
    return Session.label2dList.selectedLabels.length !== 0
  }

  /** returns whether selectedLabels is editing */
  private isEditingSelectedLabels (): boolean {
    for (const label of Session.label2dList.selectedLabels) {
      if (label.editing) {
        return true
      }
    }
    return false
  }

  /**
   * Whether a specific key is pressed down
   * @param key - the key to check
   */
  private isKeyDown (key: Key): boolean {
    return this._keyDownMap[key]
  }

  /** Select highlighted label, if any */
  private selectHighlighted (): void {
    if (this._highlightedLabel !== null) {
      const item = this._state.task.items[this._state.user.select.item]
      const labelIds = getLinkedLabelIds(item, this._highlightedLabel.labelId)
      const highlightedAlreadySelected =
        Session.label2dList.selectedLabels.includes(
          this._highlightedLabel
        )
      if (this.isKeyDown(Key.CONTROL) || this.isKeyDown(Key.META)) {
        if (highlightedAlreadySelected) {
          Session.dispatch(unselectLabels(
            Session.label2dList.selectedLabelIds,
            this._selectedItemIndex,
            labelIds
          ))
        } else {
          Session.dispatch(selectLabels(
            Session.label2dList.selectedLabelIds,
            this._selectedItemIndex,
            labelIds,
            this._highlightedLabel.category[0],
            this._highlightedLabel.attributes,
            true
          ))
        }
      } else if (!highlightedAlreadySelected) {
        Session.dispatch(selectLabels(
          Session.label2dList.selectedLabelIds,
          this._selectedItemIndex,
          labelIds,
          this._highlightedLabel.category[0],
          this._highlightedLabel.attributes
        ))
      }
    }
  }

  /** link selected labels */
  private linkLabels (): void {
    const selectedLabelIdArray = _.map(
      Session.label2dList.selectedLabels, (label) => label.labelId)
    Session.dispatch(linkLabels(
      this._state.user.select.item, selectedLabelIdArray
    ))
  }

  /** unlink selected labels */
  private unlinkLabels (): void {
    const selectedLabelIdArray = _.map(
      Session.label2dList.selectedLabels, (label) => label.labelId)
    Session.dispatch(unlinkLabels(
      this._state.user.select.item, selectedLabelIdArray
    ))
  }

  /** Process mouse click action */
  private onMouseClick (
    coord: Vector2D, labelIndex: number, handleIndex: number): void {
    console.log('on mouse click')
    if (!this.hasSelectedLabels() || !this.isEditingSelectedLabels()) {
      if (this._highlightedLabel) {
        this.selectHighlighted()
      } else {
        console.log('create label')
        Session.dispatch(selectLabels(
          {}, -1, []
        ))
        Session.label2dList.selectedLabels.length = 0
        const state = this._state

        const label = makeDrawableLabel2D(
          state.task.config.labelTypes[state.user.select.labelType]
        )
        if (label) {
          label.initTemp(state, coord)
          Session.label2dList.selectedLabels.push(label)
          Session.label2dList.labelList.push(label)
        }

        this._highlightedLabel = label
      }
    }
    console.log('call click')
    if (!this.isKeyDown(Key.META) && !this.isKeyDown(Key.CONTROL)) {
      Session.label2dList.selectedLabels.forEach((selectedLabel) => {
        if (selectedLabel !== this._highlightedLabel) {
          selectedLabel.setHighlighted(true, 0)
        }
        selectedLabel.onMouseClick(coord, labelIndex, handleIndex)
      })
    }
  }

  /** Process mouse drag action */
  private onMouseDrag (destCoord: Vector2D, canvasLimit: Size2D,
                       labelIndex: number, handleIndex: number): void {
    console.log('on mouse drag')
    if (!this.hasSelectedLabels() || !this.isEditingSelectedLabels()) {
      if (this._highlightedLabel) {
        console.log('select highlighted')
        this.selectHighlighted()
      } else {
        console.log('create label')
        Session.dispatch(selectLabels(
          {}, -1, []
        ))
        Session.label2dList.selectedLabels.length = 0
        const state = this._state

        const label = makeDrawableLabel2D(
          state.task.config.labelTypes[state.user.select.labelType]
        )
        if (label) {
          label.initTemp(state, this._mouseDownCoord)
          Session.label2dList.selectedLabels.push(label)
          Session.label2dList.labelList.push(label)
        }

        this._highlightedLabel = label
      }
    }

    if (!this.isKeyDown(Key.META) && !this.isKeyDown(Key.CONTROL)) {
      Session.label2dList.selectedLabels.forEach((selectedLabel) => {
        if (selectedLabel !== this._highlightedLabel) {
          selectedLabel.setHighlighted(true, 0)
        }
        selectedLabel.onMouseDrag(this._mouseDownCoord, destCoord,
          canvasLimit, labelIndex, handleIndex)
      })
    }
  }
}
