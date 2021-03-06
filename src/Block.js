import Eth from "ethjs";
import BN from "bn.js";
import { action, computed, when, observable, observe } from "mobx";
import withTimeout from "./util/withTimeout";

class Block {
  constructor(history, data) {
    this.history = history;
    this.number = parseInt(data.number);
    this.hash = data.hash;
    this.parentHash = data.parentHash;
    this.childrenDepth = observable.box(
      data.childrenDepth || this.computedChildrenDepth
    );
    // Confirm block when childrenDepth changes
    this.confirmDisposer = observe(this.childrenDepth, change => {
      if (change.newValue === this.childrenDepthToConfirm) {
        this.history.confirmBlock(this.hash);
        this.confirmDisposer(); // Unsubscribe from further changes
      }
    });
    // Flush block when depth changes
    when(() => this.isFlushable, () => this.history.flushBlock(this.hash));
  }

  get childrenDepthToConfirm() {
    return this.history.numConfirmations;
  }

  get depthToFlush() {
    return this.history.streamSize;
  }

  @computed
  get children() {
    return this.history.blocksByParent.get(this.hash) || [];
  }

  get computedChildrenDepth() {
    return Math.max(0, ...this.children.map(block => 1 + block.childrenDepth));
  }

  @action
  updateChildrenDepth() {
    this.childrenDepth.set(this.computedChildrenDepth);
    // Bubble up updates to parent
    if (this.parent) this.parent.updateChildrenDepth();
  }

  @computed
  get isConfirmed() {
    return this.childrenDepth >= this.childrenDepthToConfirm;
  }

  @computed
  get isFlushable() {
    // Make sure not to flush blocks before their parents are flushed
    return this.depth >= this.depthToFlush && !this.parent;
  }

  @computed
  get blocksToFlush() {
    return this.depthToFlush - this.depth;
  }

  @computed
  get parent() {
    return this.history.blocks.get(this.parentHash);
  }

  @computed
  get depth() {
    return this.history.headBlockNumber - this.number;
  }

  toSnapshot() {
    return {
      number: this.number.toString(),
      hash: this.hash.toString(),
      parentHash: this.parentHash.toString(),
      childrenDepth: this.childrenDepth
    };
  }

  toString() {
    return `Number: ${this.number}\tHash: ${this.hash.substring(
      0,
      8
    )}\tChildren Depth: ${this.childrenDepth}`;
  }
}

Block.fromSnapshot = (history, block) => {
  return new Block(history, {
    number: new BN(block.number),
    hash: block.hash,
    parentHash: block.parentHash,
    childrenDepth: parseInt(block.childrenDepth)
  });
};

export default Block;
