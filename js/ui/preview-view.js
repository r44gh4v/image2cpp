export function setPresetActiveButtons(buttons, width, height) {
    if (!buttons) {
        return;
    }

    buttons.forEach((button) => {
        const preset = button && button.dataset ? button.dataset.preset : "";
        if (!preset || preset.indexOf("x") === -1) {
            return;
        }

        const [presetWidth, presetHeight] = preset.split("x");
        const isActive = Number(presetWidth) === width && Number(presetHeight) === height;
        button.classList.toggle("active", isActive);
    });
}

export function syncPreviewSurface(canvas, timeline, isMultiFrame, width, height) {
    if (canvas) {
        canvas.width = width;
        canvas.height = height;
        canvas.classList.toggle("is-gif", Boolean(isMultiFrame));
    }

    if (timeline) {
        timeline.classList.toggle("is-hidden", !isMultiFrame);
        if (!isMultiFrame && timeline.dataset) {
            delete timeline.dataset.activeIndex;
        }
    }
}

export function setTimelineActive(timeline, activeIndex) {
    if (!timeline || !timeline.children) {
        return;
    }

    const supportsDataset = Boolean(timeline.dataset);
    if (!supportsDataset) {
        Array.from(timeline.children).forEach((element, index) => {
            element.classList.toggle("active", index === activeIndex);
        });
        return;
    }

    const previousRaw = timeline.dataset.activeIndex;
    const previousIndex = previousRaw === undefined
        ? -1
        : Number.parseInt(previousRaw, 10);

    if (previousIndex === activeIndex) {
        return;
    }

    if (
        Number.isInteger(previousIndex)
        && previousIndex >= 0
        && previousIndex < timeline.children.length
    ) {
        timeline.children[previousIndex].classList.toggle("active", false);
    }

    if (
        Number.isInteger(activeIndex)
        && activeIndex >= 0
        && activeIndex < timeline.children.length
    ) {
        timeline.children[activeIndex].classList.toggle("active", true);
        timeline.dataset.activeIndex = String(activeIndex);
        return;
    }

    delete timeline.dataset.activeIndex;
}
