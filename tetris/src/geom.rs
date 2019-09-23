//! Geometric primitives.

use core::ops::{Add, Mul, MulAssign};

macro_rules! impl_ty {
    ($t:tt, ($($dim:ident: $dty:ty, $dti:tt),+)) => {
        impl<T> $t<T> {
            pub fn new($($dim: $dty,)+) -> Self {
                Self { $($dim,)+ }
            }
        }

        impl<T> Add<Self> for $t<T> where T: Add<T, Output = T> {
            type Output = Self;
            fn add(self, rhs: Self) -> Self {
                Self {
                    $($dim: self.$dim + rhs.$dim,)+
                }
            }
        }

        impl<T> From<($($dty,)+)> for $t<T> {
            fn from(this: ($($dty,)+)) -> Self {
                Self::new($(this.$dti,)+)
            }
        }

        impl<T> Into<($($dty,)+)> for $t<T> {
            fn into(self) -> ($($dty,)+) {
                ($(self.$dim,)+)
            }
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Point2<T> {
    pub x: T,
    pub y: T,
}

impl_ty!(Point2, (x: T, 0, y: T, 1));

impl<T> From<Vector3<T>> for Point2<T> {
    fn from(this: Vector3<T>) -> Point2<T> {
        Point2 {
            x: this.x,
            y: this.y,
        }
    }
}

impl<T> From<Point2<T>> for Vector3<T>
where
    T: MulIdentity,
{
    fn from(this: Point2<T>) -> Self {
        Vector3 {
            x: this.x,
            y: this.y,
            z: T::one(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Vector3<T> {
    pub x: T,
    pub y: T,
    pub z: T,
}

impl_ty!(Vector3, (x: T, 0, y: T, 1, z: T, 2));

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Matrix3<T> {
    pub x: Vector3<T>,
    pub y: Vector3<T>,
    pub z: Vector3<T>,
}

impl_ty!(
    Matrix3,
    (x: Vector3<T>, 0, y: Vector3<T>, 1, z: Vector3<T>, 2)
);

impl<T> Matrix3<T> {
    fn transpose(self) -> Self {
        Matrix3 {
            x: (self.x.x, self.y.x, self.z.x).into(),
            y: (self.x.y, self.y.y, self.z.y).into(),
            z: (self.x.z, self.y.z, self.z.z).into(),
        }
    }
}

pub trait MulIdentity {
    fn one() -> Self;
}
pub trait AddIdentity {
    fn zero() -> Self;
}

macro_rules! impl_mul_add_ident {
    ($t:ty, $one:expr, $zero:expr) => {
        impl MulIdentity for $t {
            fn one() -> Self {
                $one
            }
        }
        impl AddIdentity for $t {
            fn zero() -> Self {
                $zero
            }
        }
    };
}

impl_mul_add_ident!(isize, 1, 0);

impl<T> Matrix3<T>
where
    T: MulIdentity + AddIdentity,
{
    pub fn identity() -> Self {
        (
            (T::one(), T::zero(), T::zero()).into(),
            (T::zero(), T::one(), T::zero()).into(),
            (T::zero(), T::zero(), T::one()).into(),
        )
            .into()
    }
}

impl<T> Mul<Vector3<T>> for Vector3<T>
where
    T: Add<T, Output = T> + Mul<T, Output = T>,
{
    type Output = T;
    fn mul(self, rhs: Self) -> T {
        self.x * rhs.x + self.y * rhs.y + self.z * rhs.z
    }
}

impl<T> Mul<Matrix3<T>> for Matrix3<T>
where
    T: Add<T, Output = T> + Mul<T, Output = T> + Copy,
{
    type Output = Self;
    fn mul(self, rhs: Self) -> Self {
        let lhs = self.transpose();
        Matrix3 {
            x: (lhs.x * rhs.x, lhs.x * rhs.y, lhs.x * rhs.z).into(),
            y: (lhs.y * rhs.x, lhs.y * rhs.y, lhs.y * rhs.z).into(),
            z: (lhs.z * rhs.x, lhs.z * rhs.y, lhs.z * rhs.z).into(),
        }
    }
}

impl<T> MulAssign<Matrix3<T>> for Matrix3<T>
where
    T: Add<T, Output = T> + Mul<T, Output = T> + Copy,
{
    fn mul_assign(&mut self, rhs: Self) {
        *self = *self * rhs
    }
}

impl<T> Mul<Vector3<T>> for Matrix3<T>
where
    T: Add<T, Output = T> + Mul<T, Output = T> + Copy,
{
    type Output = Vector3<T>;
    fn mul(self, rhs: Vector3<T>) -> Vector3<T> {
        let lhs = self.transpose();
        Vector3 {
            x: lhs.x * rhs,
            y: lhs.y * rhs,
            z: lhs.z * rhs,
        }
    }
}
