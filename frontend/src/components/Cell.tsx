import React from "react";
import styles from '../styles/Cell.module.css';

interface CellProps {
    filled: boolean;
    color?: string;
}

const Cell: React.FC<CellProps> = ({ filled, color }) => {
    return (
        <div
            className={styles.cell}
            style={{ backgroundColor: filled ? color || "white" : "transparent" }}
        />
    )
}

export default Cell;