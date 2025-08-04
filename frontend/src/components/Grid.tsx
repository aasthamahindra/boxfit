import React from "react";
import Cell from "./Cell";
import styles from '../styles/Grid.module.css';

const ROWS = 20;
const COLS = 10;

const Grid: React.FC = () => {
    const grid = Array.from({ length: ROWS * COLS }, (_, idx) => (
        <Cell key={idx} filled={false} />
    ));

    return <div className={styles.grid}>{grid}</div>;
};

export default Grid;