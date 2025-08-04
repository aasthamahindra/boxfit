import React from "react";
import styles from '../styles/Cell.module.css';

interface CellProps {
    filled: boolean;
}

const Cell: React.FC<CellProps> = ({ filled }) => {
    return <div className={`${styles.cell} ${filled ? styles.filled : ""}`} />
}

export default Cell;