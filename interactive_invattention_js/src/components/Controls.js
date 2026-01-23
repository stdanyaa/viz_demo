/**
 * Controls Component
 * UI controls for aggregation, head selection, etc.
 */

export class Controls {
    /**
     * @param {HTMLElement} container - Container element
     * @param {Function} onAggregationChange - Callback when aggregation changes
     * @param {Function} onHeadChange - Callback when head selection changes
     */
    constructor(container, onAggregationChange, onHeadChange) {
        this.container = container;
        this.onAggregationChange = onAggregationChange;
        this.onHeadChange = onHeadChange;
        
        this.aggregation = 'sum';
        this.headSelection = 'mean';
        
        this.setupControls();
    }
    
    /**
     * Setup control elements
     */
    setupControls() {
        // Aggregation selector
        const aggSelect = this.container.querySelector('#aggregation-select');
        if (aggSelect) {
            aggSelect.addEventListener('change', (e) => {
                this.aggregation = e.target.value;
                this.onAggregationChange(this.aggregation);
            });
        }
        
        // Head selector
        const headSelect = this.container.querySelector('#heads-select');
        if (headSelect) {
            headSelect.addEventListener('change', (e) => {
                this.headSelection = e.target.value;
                this.onHeadChange(this.headSelection);
            });
        }
    }
    
    /**
     * Get current aggregation method
     */
    getAggregation() {
        return this.aggregation;
    }
    
    /**
     * Get current head selection
     */
    getHeadSelection() {
        return this.headSelection;
    }
}
