/**
 * A Mobile-ready version of the Ability Template class for the DND5e system.
 */
class MobileAbilityTemplate extends dnd5e.canvas.AbilityTemplate {
	/**
	 * Track the timestamp when the last mouse move event was captured.
	 * @type {number}
	 * @override
	 */
	#moveTime = 0;

	/**
	 * The initially active CanvasLayer to re-activate after the workflow is complete.
	 * @type {CanvasLayer}
	 * @override
	 */
	#initialLayer;

	/**
	 * Track the bound event handlers so they can be properly canceled later.
	 * @type {object}
	 * @override
	 */
	#events;

	/**
	 * Activate listeners for the template preview
	 * @param {CanvasLayer} initialLayer  The initially active CanvasLayer to re-activate after the workflow is complete
	 * @returns {Promise}                 A promise that resolves with the final measured template if created.
	 * @override
	 */
	activatePreviewListeners(initialLayer) {
		return new Promise((resolve, reject) => {
			this.#initialLayer = initialLayer;
			this.#events = {
				cancel: this._onCancelPlacement.bind(this),
				confirm: this._onConfirmPlacement.bind(this),
				move: this._onMovePlacement.bind(this),
				resolve,
				reject,
				rotate: this._onRotatePlacement.bind(this),
			};

			// Activate listeners for mouse events
			canvas.stage.on('pointermove', this.#events.move);
			canvas.stage.on('mousedown', this.#events.confirm);
			canvas.app.view.oncontextmenu = this.#events.cancel;
			canvas.app.view.onwheel = this.#events.rotate;

			// Activate listeners for touch events
			canvas.stage.on('touchstart', this._onTouchStart);
			canvas.stage.on('touchend', this.#events.confirm);

			this._centerTemplateOnScreen();
		});
	}

	_centerTemplateOnScreen() {
		let { x, y } = canvas.stage.pivot;
		x -= this.document.x / 2;
		y -= this.document.y / 2;
		this.document.updateSource({ x, y });
		this.refresh();
	}

	_onTouchStart(event) {
		event.stopPropagation();
	}

	/**
	 * Move the template preview when the mouse moves.
	 * @param {Event} event  Triggering mouse event.
	 * @override
	 */
	_onMovePlacement(event) {
		event.stopPropagation();
		const now = Date.now(); // Apply a 20ms throttle
		if (now - this.#moveTime <= 20) return;

		// Determine position based on event type
		let center;
		if (event.data) {
			// Mouse event
			center = event.data.getLocalPosition(this.layer);
		} else if (event.touches && event.touches.length === 1) {
			// Touch event
			center = event.touches[0];
		}

		const interval = canvas.grid.type === CONST.GRID_TYPES.GRIDLESS ? 0 : 2;
		const snapped = canvas.grid.getSnappedPosition(center.x, center.y, interval);
		this.document.updateSource({ x: snapped.x, y: snapped.y });
		this.refresh();
		this.#moveTime = now;
	}

	/**
	 * Shared code for when template placement ends by being confirmed or canceled.
	 * @param {Event} event  Triggering event that ended the placement.
	 * @override
	 */
	async _finishPlacement(event) {
		this.layer._onDragLeftCancel(event);
		canvas.stage.off('pointermove', this.#events.move);
		canvas.stage.off('mousedown', this.#events.confirm);

		// Remove listeners for touch events
		canvas.stage.off('touchstart', this._onTouchStart);
		canvas.stage.off('touchend', this.#events.confirm);

		canvas.app.view.oncontextmenu = null;
		canvas.app.view.onwheel = null;
		this.#initialLayer.activate();
		await this.actorSheet?.maximize();
	}

	/**
	 * Confirm placement when the left mouse button is clicked.
	 * @param {Event} event  Triggering mouse event.
	 * @override
	 */
	async _onConfirmPlacement(event) {
		await this._finishPlacement(event);
		const interval = canvas.grid.type === CONST.GRID_TYPES.GRIDLESS ? 0 : 2;
		const destination = canvas.grid.getSnappedPosition(this.document.x, this.document.y, interval);
		this.document.updateSource(destination);
		this.#events.resolve(canvas.scene.createEmbeddedDocuments('MeasuredTemplate', [this.document.toObject()]));
	}

	/* -------------------------------------------- */

	/**
	 * Cancel placement when the right mouse button is clicked.
	 * @param {Event} event  Triggering mouse event.
	 * @override
	 */
	async _onCancelPlacement(event) {
		await this._finishPlacement(event);
		this.#events.reject();
	}
}

class MobileTemplateLayer extends CONFIG.MeasuredTemplate.layerClass {
	/** @override */
	async _onDragLeftStart(event) {
		const preview = canvas.templates.preview.children[0];
		if (preview && event.pointerType === 'touch') {
			event.interactionData.preview = preview;
			return;
		}
		return super._onDragLeftStart(event);
	}

	/** @override */
	_onDragLeftMove(event) {
		if (event.pointerType === 'touch') return;
		super._onDragLeftMove(event);
	}
}
CONFIG.MeasuredTemplate.layerClass = CONFIG.Canvas.layers.templates.layerClass = MobileTemplateLayer;

/**
 * Unfreezes the DND5e Canvas to replace the Ability Template class with the mobile version.
 */
dnd5e.canvas = {
	...dnd5e.canvas,
	AbilityTemplate: MobileAbilityTemplate,
};
