export const SHAPES = {
    I: [
        [1, 1, 1, 1],
    ],
    O: [
        [1, 1],
        [1, 1],
    ],
    T: [
        [0, 1, 0],
        [1, 1, 1],
    ],
    L: [
        [1, 0],
        [1, 0],
        [1, 1],
    ],
    J: [
        [0, 1],
        [0, 1],
        [1, 1],
    ],
    S: [
        [0, 1, 1],
        [1, 1, 0],
    ],
    Z: [
        [1, 1, 0],
        [0, 1, 1],
    ],
};

export const getRandomShape = () => {
    const keys = Object.keys(SHAPES) as (keyof typeof SHAPES)[];
    const rand = keys[Math.floor(Math.random() * keys.length)];
    return SHAPES[rand];
};