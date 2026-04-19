(function initImage2CppCustomSelect(root) {
    let customSelectBindingsReady = false;
    let customSelectId = 0;

    function closeCustomSelect(wrapper) {
        wrapper.classList.remove("open");
        const trigger = wrapper.querySelector(".custom-select-trigger");
        if (trigger) {
            trigger.setAttribute("aria-expanded", "false");
        }
    }

    function closeCustomSelects(exceptWrapper) {
        const safeExcept = exceptWrapper || null;
        document.querySelectorAll(".custom-select-wrapper").forEach((wrapper) => {
            if (wrapper !== safeExcept) {
                closeCustomSelect(wrapper);
            }
        });
    }

    function openCustomSelect(wrapper) {
        closeCustomSelects(wrapper);
        wrapper.classList.add("open");
        const trigger = wrapper.querySelector(".custom-select-trigger");
        if (trigger) {
            trigger.setAttribute("aria-expanded", "true");
        }
    }

    function setCustomSelectIndex(select, wrapper, index, dispatchChange) {
        const shouldDispatch = Boolean(dispatchChange);
        if (index < 0 || index >= select.options.length) {
            return;
        }

        const previousIndex = select.selectedIndex;
        select.selectedIndex = index;

        const triggerText = wrapper.querySelector(".custom-select-trigger-text");
        const selectedOption = select.options[select.selectedIndex];
        if (triggerText && selectedOption) {
            triggerText.textContent = selectedOption.text;
        }

        const optionNodes = wrapper.querySelectorAll(".custom-select-option");
        optionNodes.forEach((node, nodeIndex) => {
            const isSelected = nodeIndex === select.selectedIndex;
            node.classList.toggle("selected", isSelected);
            node.setAttribute("aria-selected", isSelected ? "true" : "false");
        });

        const activeOption = optionNodes[select.selectedIndex];
        if (activeOption && wrapper.classList.contains("open")) {
            activeOption.scrollIntoView({ block: "nearest" });
        }

        if (shouldDispatch && previousIndex !== select.selectedIndex) {
            select.dispatchEvent(new Event("change", { bubbles: true }));
        }
    }

    function buildCustomSelect(select) {
        if (select.dataset.customSelectReady === "true") {
            return;
        }

        select.dataset.customSelectReady = "true";

        const wrapper = document.createElement("div");
        wrapper.className = `custom-select-wrapper${select.classList.contains("sm") ? " sm" : ""}`;

        const trigger = document.createElement("button");
        trigger.type = "button";
        trigger.className = "custom-select-trigger";
        trigger.setAttribute("aria-haspopup", "listbox");
        trigger.setAttribute("aria-expanded", "false");

        const listboxId = `custom-select-listbox-${(customSelectId += 1)}`;
        trigger.setAttribute("aria-controls", listboxId);

        const textSpan = document.createElement("span");
        textSpan.className = "custom-select-trigger-text";
        textSpan.textContent = select.options[select.selectedIndex]
            ? select.options[select.selectedIndex].text
            : "";
        trigger.appendChild(textSpan);

        const icon = document.createElement("span");
        icon.className = "custom-select-icon";
        icon.setAttribute("aria-hidden", "true");
        icon.innerHTML = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><polyline points=\"6 9 12 15 18 9\"></polyline></svg>";
        trigger.appendChild(icon);

        const dropdown = document.createElement("div");
        dropdown.className = "custom-select-dropdown";
        dropdown.id = listboxId;
        dropdown.setAttribute("role", "listbox");

        Array.from(select.options).forEach((option, index) => {
            const item = document.createElement("div");
            item.className = "custom-select-option";
            item.textContent = option.text;
            item.setAttribute("role", "option");
            item.setAttribute("aria-selected", index === select.selectedIndex ? "true" : "false");
            if (index === select.selectedIndex) {
                item.classList.add("selected");
            }

            item.addEventListener("click", (event) => {
                event.stopPropagation();
                setCustomSelectIndex(select, wrapper, index, true);
                closeCustomSelect(wrapper);
            });

            dropdown.appendChild(item);
        });

        wrapper.appendChild(trigger);
        wrapper.appendChild(dropdown);

        select.classList.add("native-select-hidden");
        select.setAttribute("aria-hidden", "true");
        select.tabIndex = -1;
        select.insertAdjacentElement("afterend", wrapper);

        trigger.addEventListener("click", (event) => {
            event.stopPropagation();
            if (wrapper.classList.contains("open")) {
                closeCustomSelect(wrapper);
            } else {
                openCustomSelect(wrapper);
            }
        });

        trigger.addEventListener("keydown", (event) => {
            const lastIndex = select.options.length - 1;
            if (lastIndex < 0) {
                return;
            }

            switch (event.key) {
                case "ArrowDown": {
                    event.preventDefault();
                    openCustomSelect(wrapper);
                    setCustomSelectIndex(
                        select,
                        wrapper,
                        Math.min(select.selectedIndex + 1, lastIndex),
                        true,
                    );
                    break;
                }
                case "ArrowUp": {
                    event.preventDefault();
                    openCustomSelect(wrapper);
                    setCustomSelectIndex(
                        select,
                        wrapper,
                        Math.max(select.selectedIndex - 1, 0),
                        true,
                    );
                    break;
                }
                case "Home": {
                    event.preventDefault();
                    openCustomSelect(wrapper);
                    setCustomSelectIndex(select, wrapper, 0, true);
                    break;
                }
                case "End": {
                    event.preventDefault();
                    openCustomSelect(wrapper);
                    setCustomSelectIndex(select, wrapper, lastIndex, true);
                    break;
                }
                case "Enter":
                case " ":
                case "Spacebar": {
                    event.preventDefault();
                    if (wrapper.classList.contains("open")) {
                        closeCustomSelect(wrapper);
                    } else {
                        openCustomSelect(wrapper);
                    }
                    break;
                }
                case "Escape": {
                    if (wrapper.classList.contains("open")) {
                        event.preventDefault();
                        closeCustomSelect(wrapper);
                        trigger.focus();
                    }
                    break;
                }
                case "Tab": {
                    closeCustomSelect(wrapper);
                    break;
                }
                default:
                    break;
            }
        });

        select.addEventListener("change", () => {
            setCustomSelectIndex(select, wrapper, select.selectedIndex, false);
        });
    }

    function init() {
        document.querySelectorAll("select.custom-select").forEach((select) => {
            buildCustomSelect(select);
        });

        if (!customSelectBindingsReady) {
            customSelectBindingsReady = true;
            document.addEventListener("click", () => {
                closeCustomSelects();
            });
            document.addEventListener("keydown", (event) => {
                if (event.key === "Escape") {
                    closeCustomSelects();
                }
            });
        }
    }

    const api = {
        init,
        closeAll: closeCustomSelects,
        setIndex: setCustomSelectIndex,
    };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    }

    root.Image2CppCustomSelect = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
